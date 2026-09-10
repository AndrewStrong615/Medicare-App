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
    model(_refusal(goal_structuring.MEDICAL_GOAL))
    result = goal_structuring.structure("stop my headaches")
    assert isinstance(result, goal_structuring.Refusal)
    assert result.reason == goal_structuring.MEDICAL_GOAL

    model(_refusal("SOMETHING_ELSE"))
    result = goal_structuring.structure("stop my headaches")
    assert isinstance(result, goal_structuring.Refusal)
    assert result.reason == goal_structuring.UNCLEAR


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
    model(_refusal(goal_structuring.MEDICAL_GOAL))
    body = client.post(
        "/goals/draft",
        json={"description": "stop my headaches"},
        headers=auth_headers,
    ).json()

    assert body["activities"] == []
    assert "symptoms" in body["notice"]


def test_emergency_screening_runs_on_the_goal_box(client, auth_headers, model):
    """
    A goal box takes red-flag text as readily as intake does.

    The model is refusing here, so this also proves guidance is returned
    alongside a failure rather than instead of it.
    """
    model(_refusal(goal_structuring.MEDICAL_GOAL))
    body = client.post(
        "/goals/draft",
        json={"description": "stop the crushing chest pain when I walk"},
        headers=auth_headers,
    ).json()

    assert body["emergency"] is not None
    assert "911" in body["emergency"]["action"]


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
# Suggesting a starting plan, for someone who named no activities.
#
# This is the one place MedHelp proposes content nobody wrote, so the tests are
# about what it refuses rather than what it produces.
# ---------------------------------------------------------------------------


def _plan(**arguments) -> ChatReply:
    return ChatReply(
        text="",
        tool_calls=[ToolCall(id="1", name="suggest_plan", arguments=arguments)],
        model_id="test-model",
    )


def _walk_suggestion(text="Walk after lunch"):
    return {"text": text, "cadence": "daily", "preferred_time": "unspecified"}


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
        "Eat 1500 calories a day",
        "Start a low carb diet",
        "Try fasting until lunch",
        "Aim to lose weight this month",
        "Take a vitamin D supplement",
        "Check your blood pressure each morning",
        "Do a high-intensity workout",
        "Push through the discomfort",
        "Skip breakfast twice a week",
    ],
)
def test_forbidden_categories_discard_the_whole_plan(model, text):
    """
    A phrase list, not a model gate.

    A second model asked "is this safe?" fails silently open. This fails
    closed, and one bad row discards the good ones with it — a model that
    proposed a calorie target has not earned the other four suggestions.
    """
    model(
        _plan(
            title="Feeling better",
            activities=[_walk_suggestion(), _walk_suggestion(text)],
        )
    )
    assert goal_structuring.suggest_plan("I want to be healthier") is None


def test_a_forbidden_title_is_refused_too(model):
    model(_plan(title="Weight loss plan", activities=[_walk_suggestion()]))
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
    its own plan rather than split the person's sentence into rows, so the
    planner now runs for every goal that is not a medical one.

    What did not change is the failure direction. An outage, a veto or a
    refusal the planner could not place must leave the person with what
    `structure` read out of their text, never with an empty editor — the same
    rule as a model outage in triage never being SELF_CARE.
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


def test_a_medical_goal_is_never_answered_with_a_plan(
    client, auth_headers, monkeypatch
):
    """"Stop my headaches" gets a refusal, never a set of suggestions."""
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: goal_structuring.Refusal(goal_structuring.MEDICAL_GOAL),
    )
    called = []
    monkeypatch.setattr(
        goal_structuring, "suggest_plan", lambda d: called.append(d) or None
    )

    body = client.post(
        "/goals/draft",
        json={"description": "stop my headaches"},
        headers=auth_headers,
    ).json()

    assert called == []
    assert body["activities"] == []
    assert "symptoms" in body["notice"]


def test_the_plan_tool_tells_the_model_when_times_per_week_is_required():
    """
    The weekly count is required by the validator and optional in the schema,
    so the contract has to be written where the model reads it.

    This is a regression test for a real breakage. `PLAN_SYSTEM_PROMPT` was
    changed to ask for a plan spread across the week, which made the model far
    more likely to choose the `times_per_week` cadence — while the schema still
    described the count as an unlabelled optional integer. A weekly activity
    that arrived without one discarded the *whole* plan, so the person got
    their own words back and the app looked like it had ignored the change.

    JSON Schema cannot express "required when cadence is times_per_week"
    portably (it needs if/then, and providers vary in honouring it), so the
    requirement lives in two descriptions instead. If the wording is reworked,
    it still has to say this.
    """
    properties = goal_structuring.SUGGEST_PLAN["function"]["parameters"][
        "properties"
    ]
    item = properties["activities"]["items"]["properties"]

    count = item["times_per_week"]
    assert "REQUIRED" in count["description"]
    assert "times_per_week" in count["description"]
    assert count["minimum"] == 1 and count["maximum"] == 7

    # And the prompt, which is the half the model is most likely to follow.
    assert "times_per_week" in goal_structuring.PLAN_SYSTEM_PROMPT
    assert "discards the entire plan" in goal_structuring.PLAN_SYSTEM_PROMPT


def test_a_weekly_activity_with_no_count_is_still_discarded_whole():
    """
    The check itself did not move.

    The fix for the breakage above was to tell the model what the contract is,
    not to loosen the contract. A plan whose rows do not parse is still no
    plan — inventing a count would be MedHelp deciding how often someone
    should do something, which is the authoring this module exists to avoid.
    """
    discarded = goal_structuring._validate_plan(
        {
            "title": "Getting out more",
            "activities": [
                {
                    "text": "Walk after lunch",
                    "cadence": "times_per_week",
                    # No `times_per_week`.
                    "preferred_time": "afternoon",
                },
                {
                    "text": "Go to bed at the same time each night",
                    "cadence": "daily",
                    "preferred_time": "evening",
                },
            ],
        }
    )
    assert discarded is None


def test_a_weekly_activity_with_a_count_survives():
    """The same plan, with the number the contract asks for."""
    draft = goal_structuring._validate_plan(
        {
            "title": "Getting out more",
            "activities": [
                {
                    "text": "Walk after lunch",
                    "cadence": "times_per_week",
                    "times_per_week": 4,
                    "preferred_time": "afternoon",
                }
            ],
        }
    )
    assert draft is not None
    assert draft.activities[0].times_per_week == 4
    assert draft.activities[0].generated is True
    assert draft.activities[0].source_phrase is None


def test_the_planner_reading_a_goal_as_medical_overrides_structure(
    client, auth_headers, monkeypatch
):
    """
    Two readings of the text, and the stricter one wins — in that direction
    only.

    `structure` screens first, but it is reading for quotable activities while
    the planner is reading the goal as a whole. Where the planner comes back
    MEDICAL_GOAL and `structure` did not, the refusal stands and the person
    gets no plan. The reverse is not symmetrical and must never be added: a
    planner that is happy to propose walks does not clear a goal `structure`
    already refused.
    """
    monkeypatch.setattr(goal_structuring, "available", lambda: True)
    monkeypatch.setattr(
        goal_structuring,
        "structure",
        lambda description: goal_structuring.GoalDraft(
            title="Evenings",
            activities=[
                goal_structuring.Activity(
                    text="Get my blood pressure down",
                    cadence="daily",
                    preferred_time="evening",
                    source_phrase="get my blood pressure down",
                )
            ],
        ),
    )
    monkeypatch.setattr(
        goal_structuring,
        "suggest_plan",
        lambda description: goal_structuring.Refusal(goal_structuring.MEDICAL_GOAL),
    )

    body = client.post(
        "/goals/draft",
        json={"description": "get my blood pressure down"},
        headers=auth_headers,
    ).json()

    assert body["activities"] == []
    assert "symptoms" in body["notice"]


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
