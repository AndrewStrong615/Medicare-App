"""
Health goals: the safety properties, then the ordinary CRUD.

The first group is the point of the feature. `core/goal_structuring.py` lets a
model rearrange a person's words and nothing else, and the way that is enforced
is a set of deterministic checks rather than a paragraph in a prompt. These
tests are what make that claim true: each one hands the parser a model answer
that invents something and asserts the whole draft is discarded.
"""

from datetime import date

import pytest

from app.core import goal_structuring
from app.models.goal import GoalCompletion
from app.services.llm import ChatReply, LLMUnavailable, ToolCall


def _structured(**arguments) -> ChatReply:
    """A reply in which the model called `structure_goal`."""
    return ChatReply(
        text="",
        tool_calls=[ToolCall(id="1", name="structure_goal", arguments=arguments)],
        model_id="test-model",
    )


def _refusal(reason: str) -> ChatReply:
    return ChatReply(
        text="",
        tool_calls=[
            ToolCall(id="1", name="cannot_structure", arguments={"reason": reason})
        ],
        model_id="test-model",
    )


@pytest.fixture()
def model(monkeypatch):
    """
    Switch the model layer on with a scripted reply.

    `_no_live_model` in conftest leaves `llm.configured()` False, so this opts
    back in without opening a socket.
    """

    def _install(reply):
        monkeypatch.setattr(goal_structuring, "available", lambda: True)

        def _chat(**kwargs):
            if isinstance(reply, Exception):
                raise reply
            return reply

        monkeypatch.setattr(goal_structuring.llm, "chat", _chat)

    return _install


WALKING = "I want to walk in the mornings and swim at the weekend"


# ---------------------------------------------------------------------------
# The checks. Every one of these is a discard, never a repair.
# ---------------------------------------------------------------------------


def test_activity_must_quote_the_person(model):
    """
    An activity nobody wrote is refused, however plausible.

    This is the property the whole design rests on: a model that wants to add
    stretching has to quote the word out of text that never contained it.
    """
    model(
        _structured(
            title="Get moving",
            activities=[
                {
                    "text": "Stretch for ten minutes",
                    "source_phrase": "stretch every morning",
                    "cadence": "daily",
                    "preferred_time": "morning",
                }
            ],
        )
    )
    assert goal_structuring.structure(WALKING) is None


def test_one_invented_activity_discards_the_whole_draft(model):
    """A draft is all-or-nothing: a good row does not carry a bad one in."""
    model(
        _structured(
            title="Get moving",
            activities=[
                {
                    "text": "Walk in the mornings",
                    "source_phrase": "walk in the mornings",
                    "cadence": "daily",
                    "preferred_time": "morning",
                },
                {
                    "text": "Drink more water",
                    "source_phrase": "drink more water",
                    "cadence": "daily",
                    "preferred_time": "unspecified",
                },
            ],
        )
    )
    assert goal_structuring.structure(WALKING) is None


def test_a_digit_the_person_did_not_write_is_refused(model):
    """
    An invented number is the likely shape of an invented duration or dose.

    The phrase here is quoted correctly, so only the digit rule catches it.
    """
    model(
        _structured(
            title="Walking",
            activities=[
                {
                    "text": "Walk for 30 minutes in the mornings",
                    "source_phrase": "walk in the mornings",
                    "cadence": "daily",
                    "preferred_time": "morning",
                }
            ],
        )
    )
    assert goal_structuring.structure(WALKING) is None


def test_a_digit_the_person_did_write_is_kept(model):
    """The rule is about invention, not about numbers."""
    described = "walk for 20 minutes each morning"
    model(
        _structured(
            title="Walking",
            activities=[
                {
                    "text": "Walk for 20 minutes",
                    "source_phrase": "walk for 20 minutes",
                    "cadence": "daily",
                    "quantity_text": "20 minutes",
                    "preferred_time": "morning",
                }
            ],
        )
    )
    draft = goal_structuring.structure(described)
    assert isinstance(draft, goal_structuring.GoalDraft)
    assert draft.activities[0].quantity_text == "20 minutes"


def test_a_quantity_must_be_quoted_too(model):
    model(
        _structured(
            title="Walking",
            activities=[
                {
                    "text": "Walk in the mornings",
                    "source_phrase": "walk in the mornings",
                    "cadence": "daily",
                    "quantity_text": "brisk pace",
                    "preferred_time": "morning",
                }
            ],
        )
    )
    assert goal_structuring.structure(WALKING) is None


def test_case_and_spacing_differences_still_count_as_quoting(model):
    """
    Folding case cannot let an unwritten activity through - the words still
    have to be there - and rejecting it would cost a real draft for nothing.
    """
    model(
        _structured(
            title="Walking",
            activities=[
                {
                    "text": "Walk in the mornings",
                    "source_phrase": "Walk  In The\nMornings",
                    "cadence": "daily",
                    "preferred_time": "morning",
                }
            ],
        )
    )
    assert isinstance(goal_structuring.structure(WALKING), goal_structuring.GoalDraft)


def test_too_many_activities_is_refused(model):
    """A goal that explodes into a programme was written, not split."""
    model(
        _structured(
            title="Everything",
            activities=[
                {
                    "text": "Walk in the mornings",
                    "source_phrase": "walk in the mornings",
                    "cadence": "daily",
                    "preferred_time": "morning",
                }
            ]
            * (goal_structuring.MAX_ACTIVITIES + 1),
        )
    )
    assert goal_structuring.structure(WALKING) is None


def test_a_week_has_seven_days(model):
    model(
        _structured(
            title="Swimming",
            activities=[
                {
                    "text": "Swim at the weekend",
                    "source_phrase": "swim at the weekend",
                    "cadence": "times_per_week",
                    "times_per_week": 9,
                    "preferred_time": "unspecified",
                }
            ],
        )
    )
    assert goal_structuring.structure(WALKING) is None


def test_model_outage_is_never_a_plan(model):
    """Failure yields nothing. There is no generated fallback."""
    model(LLMUnavailable("down"))
    assert goal_structuring.structure(WALKING) is None


def test_no_model_configured_yields_nothing():
    """`_no_live_model` leaves the layer off; the feature still answers."""
    assert goal_structuring.structure(WALKING) is None


def test_refusal_codes_survive_and_unknown_ones_do_not(model):
    model(_refusal(goal_structuring.NO_ACTIVITY_NAMED))
    result = goal_structuring.structure("I want to be healthier")
    assert isinstance(result, goal_structuring.Refusal)
    assert result.reason == goal_structuring.NO_ACTIVITY_NAMED

    model(_refusal("SOMETHING_ELSE"))
    result = goal_structuring.structure("stop my headaches")
    assert isinstance(result, goal_structuring.Refusal)
    assert result.reason == goal_structuring.UNCLEAR


def test_the_codes_that_blocked_a_health_goal_are_gone():
    """
    ⛔ The regression guard for this whole change.

    MEDICAL_GOAL and WOULD_REQUIRE_AUTHORING were how "help me lose weight"
    became a refusal instead of a plan. They were removed on 2026-09-12 at the
    repository owner's request, and a model that asks for one now gets the
    generic UNCLEAR rather than a blocking sentence.

    This asserts against the module rather than the behaviour so that
    reintroducing either code is a failing test, not a quiet restoration of
    the dead end.
    """
    assert not hasattr(goal_structuring, "MEDICAL_GOAL")
    assert not hasattr(goal_structuring, "WOULD_REQUIRE_AUTHORING")
    assert goal_structuring.REFUSAL_REASONS == {
        goal_structuring.NO_ACTIVITY_NAMED,
        goal_structuring.UNCLEAR,
    }


def test_the_forbidden_phrase_veto_is_gone():
    """
    The deterministic veto was removed with the refusal codes.

    Stated as a test because its absence is load-bearing: `_FORBIDDEN` held
    "weight", "calorie", "blood pressure" and about sixty more, and one match
    anywhere discarded a whole plan — which is what made a health goal
    unanswerable. Anyone reinstating it should have to change this test and
    read why it was written.
    """
    assert not hasattr(goal_structuring, "_FORBIDDEN")
    assert not hasattr(goal_structuring, "mentions_forbidden")


# ---------------------------------------------------------------------------
# The endpoints.
# ---------------------------------------------------------------------------


def test_draft_writes_nothing(client, auth_headers, model):
    """A proposal leaves the person with no goals. MedHelp proposes only."""
    model(
        _structured(
            title="Walking",
            activities=[
                {
                    "text": "Walk in the mornings",
                    "source_phrase": "walk in the mornings",
                    "cadence": "daily",
                    "preferred_time": "morning",
                }
            ],
        )
    )
    draft = client.post(
        "/goals/draft", json={"description": WALKING}, headers=auth_headers
    )
    assert draft.status_code == 200
    assert draft.json()["activities"][0]["text"] == "Walk in the mornings"

    assert client.get("/goals", headers=auth_headers).json() == []


def test_the_app_writes_the_refusal_sentence_not_the_model(
    client, auth_headers, model
):
    """The model returns a code; user-facing health copy is reviewed text."""
    model(_refusal(goal_structuring.UNCLEAR))
    body = client.post(
        "/goals/draft",
        json={"description": "asdf qwer zxcv"},
        headers=auth_headers,
    ).json()

    assert body["activities"] == []
    assert "could not tell what you were going for" in body["notice"]


def test_no_notice_tells_a_person_medhelp_will_not_plan_for_them(
    client, auth_headers, model
):
    """
    ⛔ The sentences that turned a health goal away are gone from the API.

    "MedHelp can only track activities you plan to do, not symptoms,
    medicines or changes to your body" and "MedHelp does not write health
    plans" were what a person read when they asked for help with a health
    goal. Both are now false descriptions of the app, so neither may be
    reachable — including through the generic fallbacks.
    """
    from app.api import goals as goals_api

    everything = " ".join(
        [*goals_api._REFUSAL_NOTICES.values(), goals_api._NO_PROPOSAL_NOTICE]
    ).lower()

    assert "does not write health plans" not in everything
    assert "can only track activities" not in everything
    assert "not symptoms" not in everything


def test_emergency_screening_runs_on_the_goal_box(client, auth_headers, model):
    """
    A goal box takes red-flag text as readily as intake does.

    The model is refusing here, so this also proves guidance is returned
    alongside a failure rather than instead of it.

    ⛔ Emergency screening was NOT touched by the 2026-09-12 change that
    removed the plan blocking. It still runs before the model, and its
    guidance still survives a refusal.
    """
    model(_refusal(goal_structuring.UNCLEAR))
    body = client.post(
        "/goals/draft",
        json={"description": "stop the crushing chest pain when I walk"},
        headers=auth_headers,
    ).json()

    assert body["emergency"] is not None
    assert "911" in body["emergency"]["action"]


def test_a_red_flag_goal_is_never_answered_with_a_plan(
    client, auth_headers, monkeypatch
):
    """
    ⛔ THE MOST IMPORTANT TEST IN THIS FILE.

    Found against the live deployment on 2026-09-12. "I want to stop the
    crushing chest pain when I walk" returned the emergency guidance *and* a
    four-row plan titled "Gentle walking routine", including "Walk at a
    comfortable pace for five minutes, then pause and breathe" on Mon/Wed/Fri
    at 08:00 — authored by MedHelp, `generated=True`.

    An exercise schedule written by software for a textbook description of
    exertional angina. The guidance above it does not undo that; the plan is
    the part that looks like something to follow.

    The screen is now deterministic: a red flag means guidance and no plan,
    and the model is not asked at all. The prompt cannot be trusted with this
    — the prompt is what wrote the walking plan.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    asked = []
    monkeypatch.setattr(
        goal_structuring,
        "suggest_plan",
        lambda description: asked.append(description) or _never_called(),
    )
    structured = []
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: structured.append(description) or _never_called(),
    )

    body = client.post(
        "/goals/draft",
        json={"description": "I want to stop the crushing chest pain when I walk"},
        headers=auth_headers,
    ).json()

    # Guidance is there, and is the only thing offering direction.
    assert body["emergency"] is not None
    assert "911" in body["emergency"]["action"]

    # No plan, no title, and the model was never consulted.
    assert body["activities"] == []
    assert body["title"] is None
    assert asked == []
    assert structured == []

    # The notice explains the absence and points at the guidance. It must not
    # hand out advice of its own.
    assert "has not suggested a plan" in body["notice"]
    assert "guidance above" in body["notice"]


def _never_called():
    raise AssertionError("The model must not be consulted for a red-flag goal.")


def test_the_emergency_notice_gives_no_advice_of_its_own(client, auth_headers):
    """
    Only `core/emergency.py` tells anyone what to do.

    A second sentence on the same screen offering its own instruction would be
    unreviewed health copy sitting beside reviewed health copy, which is the
    one place it would most easily be mistaken for it.
    """
    from app.api import goals as goals_api

    notice = goals_api._EMERGENCY_NOTICE.lower()
    for word in ("call", "911", "rest", "stop walking", "see a doctor", "hospital"):
        assert word not in notice


def test_emergency_guidance_survives_a_model_outage(client, auth_headers, model):
    model(LLMUnavailable("down"))
    body = client.post(
        "/goals/draft",
        json={"description": "stop the crushing chest pain when I walk"},
        headers=auth_headers,
    ).json()
    assert body["emergency"] is not None


def _save_walking_goal(client, headers) -> dict:
    response = client.post(
        "/goals",
        json={
            "title": "Walking",
            "description": WALKING,
            "activities": [
                {
                    "text": "Walk in the mornings",
                    "cadence": "daily",
                    "preferred_time": "morning",
                },
                {
                    "text": "Swim at the weekend",
                    "cadence": "times_per_week",
                    "times_per_week": 1,
                    "preferred_time": "unspecified",
                },
            ],
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_save_list_and_tick(client, auth_headers):
    goal = _save_walking_goal(client, auth_headers)
    assert [a["text"] for a in goal["activities"]] == [
        "Walk in the mornings",
        "Swim at the weekend",
    ]
    assert all(not a["completed_today"] for a in goal["activities"])

    activity_id = goal["activities"][0]["id"]
    today = date.today().isoformat()

    ticked = client.post(
        f"/goals/{goal['id']}/activities/{activity_id}/completion",
        json={"completed_on": today, "completed": True},
        headers=auth_headers,
    ).json()
    assert ticked["activities"][0]["completed_today"] is True
    assert ticked["activities"][1]["completed_today"] is False

    unticked = client.post(
        f"/goals/{goal['id']}/activities/{activity_id}/completion",
        json={"completed_on": today, "completed": False},
        headers=auth_headers,
    ).json()
    assert unticked["activities"][0]["completed_today"] is False


def test_a_tick_belongs_to_one_day(client, auth_headers):
    """A day the person did not tick is simply untouched, never 'missed'."""
    goal = _save_walking_goal(client, auth_headers)
    activity_id = goal["activities"][0]["id"]

    client.post(
        f"/goals/{goal['id']}/activities/{activity_id}/completion",
        json={"completed_on": "2026-09-01", "completed": True},
        headers=auth_headers,
    )

    other_day = client.get("/goals?on=2026-09-02", headers=auth_headers).json()
    assert other_day[0]["activities"][0]["completed_today"] is False


def test_one_person_cannot_see_or_touch_another_persons_goals(
    client, auth_headers, other_user_headers
):
    goal = _save_walking_goal(client, auth_headers)

    assert client.get("/goals", headers=other_user_headers).json() == []
    assert (
        client.delete(f"/goals/{goal['id']}", headers=other_user_headers).status_code
        == 404
    )
    assert (
        client.post(
            f"/goals/{goal['id']}/activities/{goal['activities'][0]['id']}/completion",
            json={"completed_on": date.today().isoformat(), "completed": True},
            headers=other_user_headers,
        ).status_code
        == 404
    )


def test_deleting_a_goal_removes_its_ticks(client, auth_headers, db_session):
    """
    Asserted against the table, not the listing.

    SQLite does not enforce the cascade, so a listing that no longer shows the
    rows is not evidence they are gone - the same reason the reminder test
    checks the table.
    """
    goal = _save_walking_goal(client, auth_headers)
    activity_id = goal["activities"][0]["id"]
    client.post(
        f"/goals/{goal['id']}/activities/{activity_id}/completion",
        json={"completed_on": date.today().isoformat(), "completed": True},
        headers=auth_headers,
    )
    assert db_session.query(GoalCompletion).count() == 1

    assert client.delete(f"/goals/{goal['id']}", headers=auth_headers).status_code == 204
    assert db_session.query(GoalCompletion).count() == 0


def test_goals_require_a_signed_in_person(client):
    assert client.get("/goals").status_code in (401, 403)
    assert client.post("/goals/draft", json={"description": WALKING}).status_code in (
        401,
        403,
    )


# ---------------------------------------------------------------------------
# Proposing a plan, and the daily schedule under it.
#
# This is where MedHelp authors content nobody wrote. Since 2026-09-12 it runs
# for every goal including a medical one, and the content veto is gone, so
# these tests are about the shape of what it produces and about the blocking
# staying removed.
# ---------------------------------------------------------------------------


def _plan(**arguments) -> ChatReply:
    return ChatReply(
        text="",
        tool_calls=[ToolCall(id="1", name="suggest_plan", arguments=arguments)],
        model_id="test-model",
    )


# A sentinel, so `days=None` can be tested as the bad value it is rather than
# being read as "caller did not say".
_UNSET = object()


def _walk_suggestion(text="Walk after lunch", days=_UNSET, time_of_day="13:00"):
    """A planned row in the shape the model is now asked for."""
    return {
        "text": text,
        "days": list(goal_structuring.DAYS) if days is _UNSET else days,
        "time_of_day": time_of_day,
    }


def test_a_suggested_plan_is_labelled_as_suggested(model):
    model(_plan(title="Feeling better", activities=[_walk_suggestion()]))
    draft = goal_structuring.suggest_plan("I want to be healthier")

    assert isinstance(draft, goal_structuring.GoalDraft)
    activity = draft.activities[0]
    assert activity.generated is True
    # It quotes nothing, because the person wrote nothing to quote.
    assert activity.source_phrase is None


@pytest.mark.parametrize(
    "text",
    [
        "Eat your evening meal at the same time",
        "Cook at home on weeknights",
        "Take your tablets with breakfast",
        "Sit down somewhere quiet for ten minutes",
        "Walk to the shop instead of driving",
        "Go to bed at the same time each night",
    ],
)
def test_an_everyday_activity_is_no_longer_vetoed_on_its_wording(model, text):
    """
    ⛔ The counterpart of `test_the_forbidden_phrase_veto_is_gone`.

    `_FORBIDDEN` matched on words, not on meaning, so ordinary rows were
    discarded for containing "weight", "diet", "tablet" or "treat" in a
    harmless sense — and one match took the whole plan with it. Nothing is
    discarded on wording now.
    """
    model(
        _plan(
            title="Feeling better",
            activities=[_walk_suggestion(), _walk_suggestion(text)],
        )
    )
    draft = goal_structuring.suggest_plan("I want to be healthier")
    assert isinstance(draft, goal_structuring.GoalDraft)
    assert draft.activities[1].text == text


def test_a_health_goal_is_answered_with_a_plan(model):
    """
    ⛔ The behaviour this change was asked for.

    "Help me lose weight" used to reach the person as a refusal: `structure`
    returned MEDICAL_GOAL and the API short-circuited before the planner ran.
    It now comes back as a plan with a schedule.
    """
    model(
        _plan(
            title="Getting more active",
            activities=[_walk_suggestion(days=["monday", "thursday"], time_of_day="08:00")],
        )
    )
    draft = goal_structuring.suggest_plan("help me lose weight")

    assert isinstance(draft, goal_structuring.GoalDraft)
    assert draft.activities[0].days == ("monday", "thursday")
    assert draft.activities[0].time_of_day == "08:00"


def test_a_plan_carries_a_schedule_and_derives_its_cadence(model):
    """
    `cadence` and `times_per_week` are worked out from `days`, not asked for.

    That is what stops a plan saying "three times a week" beside four days —
    nothing separately reports the count, so the two cannot disagree.
    """
    model(
        _plan(
            title="Getting outdoors",
            activities=[
                _walk_suggestion(days=["monday", "wednesday", "friday"], time_of_day="07:30"),
                _walk_suggestion("Wind down", days=list(goal_structuring.DAYS), time_of_day="21:00"),
            ],
        )
    )
    draft = goal_structuring.suggest_plan("I want to get outdoors more")
    assert isinstance(draft, goal_structuring.GoalDraft)

    weekly, daily = draft.activities
    assert weekly.cadence == "times_per_week"
    assert weekly.times_per_week == 3
    assert weekly.preferred_time == "morning"

    assert daily.cadence == "daily"
    assert daily.times_per_week is None
    assert daily.preferred_time == "evening"


def test_days_come_back_in_week_order_however_they_were_given(model):
    """A schedule reads the same however the model listed the days."""
    model(
        _plan(
            title="Getting outdoors",
            activities=[_walk_suggestion(days=["sunday", "monday", "friday"])],
        )
    )
    draft = goal_structuring.suggest_plan("I want to get outdoors more")
    assert isinstance(draft, goal_structuring.GoalDraft)
    assert draft.activities[0].days == ("monday", "friday", "sunday")


@pytest.mark.parametrize("bad", ["8am", "0800", "8:00", "25:00", "12:60", "", "noon"])
def test_a_time_is_refused_rather_than_guessed(model, bad):
    """
    Same rule as `dose_schedule.py`: "8" could be either end of the day.

    A whole plan is discarded rather than one row kept with a blank time — a
    half-scheduled plan is harder to notice than an absent one.
    """
    model(_plan(title="Feeling better", activities=[_walk_suggestion(time_of_day=bad)]))
    assert goal_structuring.suggest_plan("I want to be healthier") is None


@pytest.mark.parametrize("bad", [[], ["someday"], ["monday", "funday"], "monday", None])
def test_an_unusable_day_list_discards_the_plan(model, bad):
    model(_plan(title="Feeling better", activities=[_walk_suggestion(days=bad)]))
    assert goal_structuring.suggest_plan("I want to be healthier") is None


def test_a_suggested_plan_stays_small(model):
    model(
        _plan(
            title="Feeling better",
            activities=[_walk_suggestion()] * (goal_structuring.MAX_SUGGESTED + 1),
        )
    )
    assert goal_structuring.suggest_plan("I want to be healthier") is None


def test_suggesting_fails_closed(model):
    model(LLMUnavailable("down"))
    assert goal_structuring.suggest_plan("I want to be healthier") is None


def test_a_planner_outage_falls_back_to_the_persons_own_words(
    client, auth_headers, monkeypatch
):
    """
    The planner is asked even when the person named their own activities, and
    a planner that cannot answer leaves their own words standing.

    This test used to assert the opposite — that suggesting was reserved for an
    empty box. The repository owner asked on 2026-09-09 for MedHelp to propose
    its own plan rather than split the person's sentence into rows, and on
    2026-09-12 for the medical-goal gate to go, so the planner now runs for
    every goal without exception.

    What did not change is the failure direction. An outage, or a refusal the
    planner could not place, must leave the person with what `structure` read
    out of their text, never with an empty editor — the same rule as a model
    outage in triage never being SELF_CARE.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: goal_structuring.GoalDraft(
            title="Walking",
            activities=[
                goal_structuring.Activity(
                    text="Walk in the mornings",
                    cadence="daily",
                    preferred_time="morning",
                    source_phrase="walk in the mornings",
                )
            ],
        ),
    )
    called = []
    monkeypatch.setattr(
        goal_structuring, "suggest_plan", lambda d: called.append(d) or None
    )

    body = client.post(
        "/goals/draft", json={"description": WALKING}, headers=auth_headers
    ).json()

    # Asked, where it used to be skipped.
    assert called == [WALKING]
    # And, having returned nothing, it left the person's own row alone.
    assert body["activities"][0]["text"] == "Walk in the mornings"
    assert body["activities"][0]["generated"] is False


def test_an_originated_plan_replaces_the_split_and_is_labelled(
    client, auth_headers, monkeypatch
):
    """
    The main path: MedHelp proposes its own plan, not the person's sentence in
    rows, and every row it proposes says so.

    The label is the load-bearing part. An originated plan is health content
    nobody wrote, and `generated=True` is what puts "Suggested by MedHelp —
    edit it or remove it" on the row. A plan that arrived unlabelled would read
    as the person's own writing handed back to them.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    # The person named one activity, so the old behaviour would have returned
    # exactly this row and never asked the planner.
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: goal_structuring.GoalDraft(
            title="Walking",
            activities=[
                goal_structuring.Activity(
                    text="Walk in the mornings",
                    cadence="daily",
                    preferred_time="morning",
                    source_phrase="walk in the mornings",
                )
            ],
        ),
    )
    monkeypatch.setattr(
        goal_structuring,
        "suggest_plan",
        lambda description: goal_structuring.GoalDraft(
            title="Getting out more",
            activities=[
                goal_structuring.Activity(
                    text="Walk after lunch",
                    cadence="times_per_week",
                    times_per_week=4,
                    preferred_time="afternoon",
                    source_phrase=None,
                    generated=True,
                ),
                goal_structuring.Activity(
                    text="Go to bed at the same time each night",
                    cadence="daily",
                    preferred_time="evening",
                    source_phrase=None,
                    generated=True,
                ),
            ],
        ),
    )

    body = client.post(
        "/goals/draft", json={"description": WALKING}, headers=auth_headers
    ).json()

    assert body["title"] == "Getting out more"
    texts = [a["text"] for a in body["activities"]]
    assert texts == ["Walk after lunch", "Go to bed at the same time each night"]
    # Not the row `structure` read out of their sentence.
    assert "Walk in the mornings" not in texts
    # ⛔ Every originated row carries the label.
    assert all(a["generated"] is True for a in body["activities"])
    assert all(a["source_phrase"] is None for a in body["activities"])
    # A rhythm, not five daily rows.
    assert body["activities"][0]["times_per_week"] == 4


def test_a_medical_goal_now_reaches_the_planner(client, auth_headers, monkeypatch):
    """
    ⛔ The inverse of the test this replaced.

    `test_a_medical_goal_is_never_answered_with_a_plan` asserted that "stop my
    headaches" produced a refusal and that the planner was **never called**.
    The repository owner asked on 2026-09-12 for that gate to go, so the
    planner is now asked for every goal and its plan is what the person gets.

    Kept as a test rather than deleted because the old behaviour is the thing
    someone would most plausibly restore by accident.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    called = []

    def _plan_for(description):
        called.append(description)
        return goal_structuring.GoalDraft(
            title="Winding down",
            activities=[
                goal_structuring.Activity(
                    text="Go to bed at the same time each night",
                    cadence="daily",
                    preferred_time="evening",
                    source_phrase=None,
                    generated=True,
                    days=goal_structuring.DAYS,
                    time_of_day="22:00",
                )
            ],
        )

    monkeypatch.setattr(goal_structuring, "suggest_plan", _plan_for)

    body = client.post(
        "/goals/draft",
        json={"description": "stop my headaches"},
        headers=auth_headers,
    ).json()

    assert called == ["stop my headaches"]
    assert body["notice"] is None
    assert body["activities"][0]["text"] == "Go to bed at the same time each night"
    assert body["activities"][0]["time_of_day"] == "22:00"
    # Still labelled: an authored row must always say it was authored.
    assert body["activities"][0]["generated"] is True


def test_the_planner_runs_before_structure_and_structure_is_skipped(
    client, auth_headers, monkeypatch
):
    """
    The order reversed on 2026-09-12, and the saving is not incidental.

    `structure` used to run first so a refusal could short-circuit the
    planner. With no gate left to apply, running it first would be a second
    model call whose only use is a fallback that is not needed.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    structured = []
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: structured.append(description) or None,
    )
    monkeypatch.setattr(
        goal_structuring,
        "suggest_plan",
        lambda description: goal_structuring.GoalDraft(
            title="Getting out more",
            activities=[
                goal_structuring.Activity(
                    text="Walk after lunch",
                    cadence="daily",
                    preferred_time="afternoon",
                    source_phrase=None,
                    generated=True,
                    days=goal_structuring.DAYS,
                    time_of_day="13:00",
                )
            ],
        ),
    )

    body = client.post(
        "/goals/draft", json={"description": WALKING}, headers=auth_headers
    ).json()

    assert structured == []
    assert body["activities"][0]["text"] == "Walk after lunch"


def test_the_plan_tool_asks_for_a_schedule_not_a_cadence():
    """
    The model is asked for days and a time, and `cadence` is derived.

    This replaces the regression test for the old contract, where a weekly
    cadence without its count discarded the whole plan. That failure mode is
    gone by construction: nothing separately reports a count any more, so
    there is nothing for the model to omit.
    """
    item = goal_structuring.SUGGEST_PLAN["function"]["parameters"]["properties"][
        "activities"
    ]["items"]

    assert set(item["required"]) == {"text", "days", "time_of_day"}
    assert "cadence" not in item["properties"]
    assert "times_per_week" not in item["properties"]
    assert item["properties"]["days"]["items"]["enum"] == list(goal_structuring.DAYS)

    # And the prompt, which is the half the model is most likely to follow.
    assert "HH:MM" in goal_structuring.PLAN_SYSTEM_PROMPT
    assert "Do not set `cadence`" in goal_structuring.PLAN_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Rate limiting. Found against the live deployment on 2026-09-12: the fifth
# goal inside a minute fast-failed, and every one after it, while the same
# text worked again minutes later. Everyone affected was told "MedHelp has no
# suggestions right now", which is wrong and unactionable.
# ---------------------------------------------------------------------------


def test_a_rate_limit_is_not_reported_as_having_no_suggestions(
    client, auth_headers, monkeypatch
):
    """
    ⛔ The regression test for the production bug.

    A rate limit is temporary and fixes itself. Telling someone the app has
    nothing to suggest for their goal — and offering them the manual path as
    the remedy — sends them away from something that would have worked on the
    next press.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    monkeypatch.setattr(
        goal_structuring,
        "suggest_plan",
        lambda description: goal_structuring.Busy(5),
    )

    body = client.post(
        "/goals/draft",
        json={"description": "I want to lose weight"},
        headers=auth_headers,
    ).json()

    notice = body["notice"]
    assert body["activities"] == []
    assert "busy" in notice.lower()
    assert "again" in notice.lower()
    # The sentence that was wrong. It must not be what a rate limit produces.
    assert "no suggestions" not in notice.lower()


def test_a_rate_limit_does_not_spend_a_second_call_on_the_same_quota(
    client, auth_headers, monkeypatch
):
    """
    `structure` is the same endpoint and the same quota.

    Falling back to it when the planner was rate limited cannot succeed — it
    only makes a rate-limited person wait twice as long for the same answer.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    monkeypatch.setattr(
        goal_structuring, "suggest_plan", lambda description: goal_structuring.Busy(3)
    )
    structured = []
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: structured.append(description) or None,
    )

    client.post(
        "/goals/draft",
        json={"description": "I want to get outdoors more"},
        headers=auth_headers,
    )

    assert structured == []


def test_a_busy_model_still_leaves_the_person_a_way_forward(
    client, auth_headers, monkeypatch
):
    """
    A rate limit on ordinary text: no plan, but an actionable sentence.

    ⛔ This test used to submit chest-pain text and assert guidance survived a
    rate limit. That became vacuous once a red flag started short-circuiting
    before the model is called — guidance could not fail to survive a vendor
    that was never asked. The red-flag path has its own test above; this one
    keeps the rate-limit path honest by using text that reaches the model.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    monkeypatch.setattr(
        goal_structuring, "suggest_plan", lambda description: goal_structuring.Busy(2)
    )

    body = client.post(
        "/goals/draft",
        json={"description": "I want to get outdoors more"},
        headers=auth_headers,
    ).json()

    assert body["emergency"] is None
    assert body["activities"] == []
    assert "busy" in body["notice"].lower()
    assert "again" in body["notice"].lower()


def test_a_rate_limited_planner_returns_busy_not_none(model, monkeypatch):
    """
    `LLMRateLimited` is turned into `Busy`, not swallowed as a generic outage.

    It subclasses `LLMUnavailable`, so the danger is a bare `except
    LLMUnavailable` further up catching it first and losing the distinction.
    """
    from app.services.llm import LLMRateLimited

    monkeypatch.setattr(goal_structuring, "available", lambda: True)

    def _chat(**kwargs):
        raise LLMRateLimited("limited", 7)

    monkeypatch.setattr(goal_structuring.llm, "chat", _chat)

    result = goal_structuring.suggest_plan("I want to be healthier")
    assert isinstance(result, goal_structuring.Busy)
    assert result.retry_after_seconds == 7


def test_a_rate_limit_still_counts_as_unavailable_for_anyone_not_looking(
    model, monkeypatch
):
    """
    ⛔ The safety property behind making it a subclass.

    Every existing `except LLMUnavailable` must keep catching a rate limit, so
    no caller becomes less safe by the new class existing. In triage that
    means the rule tier still stands.
    """
    from app.services.llm import LLMRateLimited, LLMUnavailable

    assert issubclass(LLMRateLimited, LLMUnavailable)

    caught = None
    try:
        raise LLMRateLimited("limited", 3)
    except LLMUnavailable as exc:
        caught = exc
    assert caught is not None


def test_the_plan_prompt_forbids_a_title_that_promises_a_clinical_result():
    """
    Observed live on 2026-09-12: "Headache relief routine" and "Blood pressure
    support routine".

    The activities under both were clean — ordinary walks, water, a regular
    bedtime. The title was the problem: it attached a therapeutic function to
    the plan, which is the same claim the activities are forbidden from
    making, in the part a person reads first and repeats to themselves.
    """
    prompt = goal_structuring.PLAN_SYSTEM_PROMPT

    assert "NO CLINICAL RESULT" in prompt
    assert "Headache relief routine" in prompt
    assert "Blood pressure support routine" in prompt


def test_the_plan_prompt_does_not_hand_the_model_a_generic_title_to_copy():
    """
    ⛔ THE FIRST FIX OVER-CORRECTED, AND THIS GUARDS AGAINST REPEATING IT.

    The rule against clinical titles shipped with a list of approved examples
    — "Daily routine", "Movement and meals" — and the model simply copied
    them. Re-measured against the live deployment: of 16 plans in one run,
    "Daily routine" came back 6 times and "Movement and meals" 4 times, for
    goals as different as quitting smoking, lowering cholesterol and coming
    off antidepressants. The clinical claims were gone, and so was any way to
    tell one saved goal from another in a list.

    An example in a prompt is not an illustration, it is a suggestion. The
    generic ones are now named as forbidden rather than offered, and every
    example that remains is built out of specific activities.

    This asserts the shape of the instruction, not the model's output. The
    output is measured by running it, which is how the bug was found in the
    first place and how the fix was confirmed.
    """
    prompt = goal_structuring.PLAN_SYSTEM_PROMPT

    assert "NO CATEGORY LABEL" in prompt

    # The two titles that were actually copied appear only as forbidden ones.
    never = prompt.split("NO CATEGORY LABEL", 1)[1].split("Build the title", 1)[0]
    for copied in ('"Daily routine"', '"Movement and meals"'):
        assert copied in never, f"{copied} must be named as forbidden"

    # And the prompt says what a title is *for*, which is what produces a
    # specific one rather than merely a non-clinical one.
    assert "three titles in a list" in prompt


def test_the_plan_prompt_does_not_tell_the_model_to_refuse_health_goals():
    """
    ⛔ The prompt is now the only guard, so what it says is load-bearing.

    Two halves. It must no longer carry the refusal that blocked a health
    goal, and it must still carry the one rule that was never about blocking:
    propose the activity, never a claim about what the activity will do.
    """
    prompt = goal_structuring.PLAN_SYSTEM_PROMPT

    assert "MEDICAL_GOAL" not in prompt
    assert "WOULD_REQUIRE_AUTHORING" not in prompt
    assert "Do not refuse a goal for being about health" in prompt

    # Still refused, because these are a clinician's call and not a plan.
    assert "No benefits, no reasons, no" in prompt
    assert "never a change to what that is" in prompt


# ---------------------------------------------------------------------------
# Whether a model is configured must be answerable without submitting a goal.
# ---------------------------------------------------------------------------


def test_health_reports_whether_goals_have_a_model(client, monkeypatch):
    """
    A misconfigured goals endpoint used to be invisible from the outside.

    Drafting answers with an empty editor for a missing key, an unreachable
    endpoint and a refusal alike, so "is a model even configured?" could not
    be answered from a deployment you cannot attach a debugger to. It is a
    boolean, like `symptom_intake_configured` beside it: never the vendor,
    never the key.
    """
    from app.core.config import settings

    assert client.get("/health").json()["health_goals_model_configured"] is False

    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")
    assert client.get("/health").json()["health_goals_model_configured"] is True


def test_boot_says_which_model_goals_will_use(monkeypatch, caplog):
    """The key is never logged — only the host, the model, and where it came from."""
    import logging

    from app.core.config import settings
    from app.main import report_goals_endpoint

    monkeypatch.setattr(settings, "groq_api_key", "gsk_synthetic")
    with caplog.at_level(logging.INFO):
        report_goals_endpoint()

    assert "api.groq.com" in caplog.text
    assert "GROQ_API_KEY" in caplog.text
    assert "gsk_synthetic" not in caplog.text


def test_boot_says_plainly_when_goals_have_no_model(caplog):
    """"Not configured" and "configured and failing" are different problems."""
    report = __import__("app.main", fromlist=["report_goals_endpoint"])
    report.report_goals_endpoint()

    assert "NO MODEL configured" in caplog.text
    assert "GROQ_API_KEY" in caplog.text


def test_a_discarded_draft_says_which_check_caught_it(caplog):
    """
    A discarded draft and an unreachable endpoint look identical from outside
    — an empty editor under the same sentence — and they are opposite
    problems. The log now separates them.
    """
    import logging

    with caplog.at_level(logging.INFO):
        result = goal_structuring._validate(
            {
                "title": "Getting outdoors more",
                "activities": [
                    {
                        # Paraphrased rather than quoted: the check that
                        # carries the whole design.
                        "text": "Go for a stroll each morning",
                        "source_phrase": "stroll each morning",
                        "cadence": "daily",
                        "preferred_time": "morning",
                    }
                ],
            },
            "I want to walk in the mornings",
        )

    assert result is None
    assert "source_phrase is not in the submitted text" in caplog.text


def test_the_discard_log_never_carries_the_persons_words(caplog):
    """
    ⛔ The check name is about the app; the values are health text about a
    person. CLAUDE.md forbids the second reaching the log.
    """
    import logging

    with caplog.at_level(logging.INFO):
        goal_structuring._validate(
            {
                "title": "Swimming",
                "activities": [
                    {
                        "text": "Swim 40 lengths on Saturdays",
                        "source_phrase": "swim on Saturdays",
                        "cadence": "times_per_week",
                        "times_per_week": 1,
                        "preferred_time": "unspecified",
                    }
                ],
            },
            "I want to swim on Saturdays",
        )

    assert "invents a digit" in caplog.text
    assert "Saturdays" not in caplog.text
    assert "Swim" not in caplog.text
