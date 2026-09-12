"""
Health goals: the person writes what they intend to do, and ticks it off.

Every row here is health data about a named person. The rules from
`api/medications.py` apply unchanged:

* Every query filters on the authenticated user. An unknown goal id and
  someone else's goal id both return 404, so this cannot be used to discover
  that a record exists.
* Nothing in this module logs a goal title, an activity, or a description.

## MedHelp proposes. It never saves.

`POST /goals/draft` proposes a plan — activities, the days they fall on and
the time of day for each — and **writes nothing**; a test asserts a draft
leaves the user with no goals. Rows exist only after `POST /goals` sends back
what the person confirmed on screen, the same read-then-confirm shape as
medication reminders.

⛔ Since 2026-09-12 that plan is authored by MedHelp for **any** goal,
including a medical one, and no deterministic check screens it. The refusal
that used to turn "get my blood pressure down" into a dead end was removed at
the repository owner's request. Read the module docstring of
`core/goal_structuring.py` before changing anything on this path — what
guards it is a prompt, not a check.

## Emergency screening runs first, and before any vendor

A goal box is a free-text health input like any other in this app. Someone will
type "stop feeling dizzy on the stairs" into it. `screen_for_emergency` runs on
the submitted text before the model is called, its guidance is returned
alongside whatever else happened, and it is never withheld because a later step
failed - the same contract as symptom search.

## The sentences a person reads are written here

`core/goal_structuring.py` returns a refusal *code*. The wording lives in
`_REFUSAL_NOTICES` below, for the same reason `emergency.py` owns its guidance
copy: user-facing text in a health app is reviewed text, and a model writing
its own apology is unreviewed text on a screen.

NOT REVIEWED BY A CLINICIAN. See the note in `core/goal_structuring.py`.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core import goal_structuring
from app.core.dependencies import get_current_user
from app.core.emergency import screen_for_emergency
from app.core.goal_structuring import (
    NO_ACTIVITY_NAMED,
    UNCLEAR,
    Busy,
    GoalDraft,
    Refusal,
)
from app.db.session import get_db
from app.models.goal import GoalActivity, GoalCompletion, HealthGoal
from app.models.user import User
from app.schemas.goal import (
    ActivityDraftOut,
    ActivityOut,
    CompletionIn,
    GoalCreateIn,
    GoalDraftIn,
    GoalDraftOut,
    GoalOut,
)
from app.schemas.symptom import EmergencyGuidanceOut

router = APIRouter(prefix="/goals", tags=["goals"])


# What the person reads when MedHelp has no proposal. Each one says what
# happened and leaves them a way forward, because the editor is open either
# way - a refusal costs one screen of typing, never a dead end.
#
# ⛔ TWO NOTICES WERE DELETED ON 2026-09-12, with the refusal codes behind
# them. "MedHelp can only track activities you plan to do, not symptoms,
# medicines or changes to your body" (MEDICAL_GOAL) and "MedHelp does not
# write health plans" (WOULD_REQUIRE_AUTHORING) were the sentences a person
# got when they asked for help with a health goal. Both are now false as
# descriptions of the app, which is the point of the change rather than an
# oversight: MedHelp does write health plans now. Do not reinstate either
# sentence without reinstating the behaviour it describes.
_REFUSAL_NOTICES = {
    NO_ACTIVITY_NAMED: (
        "MedHelp could not find a goal in what you wrote. Write what you would "
        "like to work towards and it will suggest a plan."
    ),
    UNCLEAR: (
        "MedHelp could not tell what you were going for. You can add your own "
        "activities below."
    ),
}

_NO_PROPOSAL_NOTICE = (
    "MedHelp has no suggestions right now. You can add your activities below."
)


def _busy_notice(retry_after_seconds: int | None) -> str:
    """
    What a rate-limited person reads.

    ⛔ IT MUST SAY "TRY AGAIN", AND IT MUST NOT SAY "NO SUGGESTIONS".

    Found against the live deployment on 2026-09-12: once the free-tier
    provider started rate limiting, every goal came back as "MedHelp has no
    suggestions right now. You can add your activities below." The plan was
    one button-press away the whole time. That sentence told people the app
    had nothing for their goal, and pointed them at the one remedy - type it
    yourself - that was not the answer.

    So this names the cause, gives the remedy, and only then mentions the
    manual path as a choice rather than a consolation. The wait is rounded up
    to whole seconds and only quoted when the provider gave a short, credible
    one; an unbounded "try later" is worse than no number at all.
    """
    if retry_after_seconds is not None and 1 <= retry_after_seconds <= 120:
        when = (
            "in a few seconds"
            if retry_after_seconds <= 10
            else f"in about {retry_after_seconds} seconds"
        )
    else:
        when = "in a few seconds"
    return (
        f"MedHelp is busy right now. Press “Suggest a plan” again {when} and it "
        "should work. You can also add your own activities below."
    )


def _get_owned_goal_or_404(goal_id: str, user: User, db: Session) -> HealthGoal:
    goal = (
        db.query(HealthGoal)
        .filter(HealthGoal.id == goal_id, HealthGoal.user_id == user.id)
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return goal


@router.post("/draft", response_model=GoalDraftOut)
def draft_goal(
    payload: GoalDraftIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalDraftOut:
    """
    Propose a set of trackable activities from the person's own words.

    Writes nothing. The person edits the result and posts it back to `/goals`
    if they want it kept.
    """
    # First, and before any vendor is contacted. A content or model failure can
    # never swallow the instruction to get help.
    guidance = screen_for_emergency(payload.description)
    emergency = (
        EmergencyGuidanceOut(**guidance.__dict__) if guidance is not None else None
    )

    # ⛔ THE PLANNER RUNS FIRST, AND NOTHING SCREENS THE GOAL BEFORE IT.
    #
    # Until 2026-09-12 `structure` ran first so that a MEDICAL_GOAL refusal
    # could short-circuit the planner: "get my blood pressure down" reached
    # the person as a refusal even though the planner would have answered it.
    # The repository owner asked for that gate removed, so the order is now
    # the plain one - MedHelp proposes a plan for whatever was typed.
    #
    # What still holds: every row comes back `generated=True` and is labelled
    # "Suggested by MedHelp" on screen, and nothing is saved until the person
    # presses save. Emergency screening has already run, above.
    result = goal_structuring.suggest_plan(payload.description)

    if isinstance(result, Busy):
        # ⛔ Do NOT fall back to `structure` here. It is the same endpoint and
        # the same quota, so a second call is guaranteed to fail too - it
        # would only make a rate-limited person wait twice as long to be told
        # the same thing. Answer immediately and tell them to try again.
        return GoalDraftOut(
            title=None,
            activities=[],
            notice=_busy_notice(result.retry_after_seconds),
            emergency=emergency,
        )

    if not isinstance(result, GoalDraft):
        # The planner had nothing - an outage, no endpoint configured, or an
        # answer that failed its shape checks. Fall back to splitting the
        # person's own words, which is a worse plan than an originated one and
        # a far better screen than an empty editor. A `structure` refusal is
        # only ever reached once the planner has already failed, so it can no
        # longer block a plan by itself.
        fallback = goal_structuring.structure(payload.description)
        if isinstance(fallback, GoalDraft):
            result = fallback
        elif result is None:
            # The planner failed without saying why. A refusal code from
            # `structure` is a better sentence for the person than the
            # generic "no suggestions right now"; None here keeps that.
            result = fallback

    if isinstance(result, GoalDraft):
        return GoalDraftOut(
            title=result.title,
            activities=[
                ActivityDraftOut(
                    text=activity.text,
                    source_phrase=activity.source_phrase,
                    cadence=activity.cadence,
                    times_per_week=activity.times_per_week,
                    quantity_text=activity.quantity_text,
                    preferred_time=activity.preferred_time,
                    generated=activity.generated,
                    days=list(activity.days),
                    time_of_day=activity.time_of_day,
                )
                for activity in result.activities
            ],
            notice=None,
            emergency=emergency,
        )

    notice = (
        _REFUSAL_NOTICES.get(result.reason, _REFUSAL_NOTICES[UNCLEAR])
        if isinstance(result, Refusal)
        else _NO_PROPOSAL_NOTICE
    )
    return GoalDraftOut(
        title=None, activities=[], notice=notice, emergency=emergency
    )


@router.post("", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalOut:
    """Save a goal the person confirmed on screen."""
    goal = HealthGoal(
        user_id=user.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
    )
    for position, activity in enumerate(payload.activities):
        goal.activities.append(
            GoalActivity(
                text=activity.text.strip(),
                cadence=activity.cadence,
                times_per_week=(
                    activity.times_per_week
                    if activity.cadence == "times_per_week"
                    else None
                ),
                quantity_text=(
                    activity.quantity_text.strip() if activity.quantity_text else None
                ),
                preferred_time=activity.preferred_time,
                # Stored as a comma-separated string of day names in week
                # order - see the note on the column. Empty means no
                # particular day, which is what a hand-typed activity has
                # until the person picks days for it.
                days=",".join(activity.days),
                time_of_day=activity.time_of_day,
                position=position,
            )
        )

    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _to_out(goal, on=date.today(), db=db)


@router.get("", response_model=list[GoalOut])
def list_goals(
    on: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[GoalOut]:
    """
    The person's goals, with each activity's tick state for one local day.

    `on` is the client's own calendar date. It defaults to the server's, which
    is right for a request made from the same day and wrong across a timezone -
    so the client always sends it.
    """
    goals = (
        db.query(HealthGoal)
        .filter(HealthGoal.user_id == user.id)
        .order_by(HealthGoal.created_at.desc())
        .all()
    )
    day = on or date.today()
    return [_to_out(goal, on=day, db=db) for goal in goals]


@router.post("/{goal_id}/activities/{activity_id}/completion", response_model=GoalOut)
def set_completion(
    goal_id: str,
    activity_id: str,
    payload: CompletionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalOut:
    """
    Tick or untick one activity for one day.

    Unticking deletes the row. There is no history of having changed one's
    mind: a tick is a note the person made for themselves, not a record this
    app keeps about them.
    """
    goal = _get_owned_goal_or_404(goal_id, user, db)
    activity = next((a for a in goal.activities if a.id == activity_id), None)
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found.")

    existing = (
        db.query(GoalCompletion)
        .filter(
            GoalCompletion.activity_id == activity.id,
            GoalCompletion.completed_on == payload.completed_on,
        )
        .first()
    )

    if payload.completed and existing is None:
        db.add(
            GoalCompletion(activity_id=activity.id, completed_on=payload.completed_on)
        )
    elif not payload.completed and existing is not None:
        db.delete(existing)
    db.commit()

    db.refresh(goal)
    return _to_out(goal, on=payload.completed_on, db=db)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Delete a goal, its activities and every tick.

    SQLite does not enforce the cascade, so the rows are removed explicitly -
    the same reason `api/reminders.py` deletes reminders in the endpoint rather
    than trusting the foreign key.
    """
    goal = _get_owned_goal_or_404(goal_id, user, db)
    activity_ids = [activity.id for activity in goal.activities]
    if activity_ids:
        db.query(GoalCompletion).filter(
            GoalCompletion.activity_id.in_(activity_ids)
        ).delete(synchronize_session=False)
    db.delete(goal)
    db.commit()


def _days_of(activity: GoalActivity) -> list[str]:
    """
    The stored day string as a list, in week order and without junk.

    Filtered against `DAYS` rather than split and trusted: the column is free
    text, and a value that is not a day name would reach the client as a
    schedule row nobody can act on.
    """
    if not activity.days:
        return []
    named = {part.strip().lower() for part in activity.days.split(",")}
    return [day for day in goal_structuring.DAYS if day in named]


def _to_out(goal: HealthGoal, *, on: date, db: Session) -> GoalOut:
    activity_ids = [activity.id for activity in goal.activities]
    ticked: set[str] = set()
    if activity_ids:
        ticked = {
            row.activity_id
            for row in db.query(GoalCompletion)
            .filter(
                GoalCompletion.activity_id.in_(activity_ids),
                GoalCompletion.completed_on == on,
            )
            .all()
        }

    return GoalOut(
        id=goal.id,
        title=goal.title,
        description=goal.description,
        created_at=goal.created_at,
        activities=[
            ActivityOut(
                id=activity.id,
                text=activity.text,
                cadence=activity.cadence,
                times_per_week=activity.times_per_week,
                quantity_text=activity.quantity_text,
                preferred_time=activity.preferred_time,
                days=_days_of(activity),
                time_of_day=activity.time_of_day,
                completed_today=activity.id in ticked,
            )
            for activity in goal.activities
        ],
    )
