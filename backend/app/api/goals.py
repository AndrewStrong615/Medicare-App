"""
Health goals: the person writes what they intend to do, and ticks it off.

Every row here is health data about a named person. The rules from
`api/medications.py` apply unchanged:

* Every query filters on the authenticated user. An unknown goal id and
  someone else's goal id both return 404, so this cannot be used to discover
  that a record exists.
* Nothing in this module logs a goal title, an activity, or a description.

## MedHelp proposes. It never saves.

`POST /goals/draft` splits the person's text into activities and **writes
nothing** - a test asserts a draft leaves the user with no goals. Rows exist
only after `POST /goals` sends back what the person confirmed on screen, the
same read-then-confirm shape as medication reminders.

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
    MEDICAL_GOAL,
    NO_ACTIVITY_NAMED,
    UNCLEAR,
    WOULD_REQUIRE_AUTHORING,
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
_REFUSAL_NOTICES = {
    NO_ACTIVITY_NAMED: (
        "MedHelp could not find anything to track in what you wrote. Add the "
        "things you plan to do and they will appear here."
    ),
    MEDICAL_GOAL: (
        "MedHelp can only track activities you plan to do, not symptoms, "
        "medicines or changes to your body. If something is worrying you, "
        "speak to a healthcare professional."
    ),
    WOULD_REQUIRE_AUTHORING: (
        "MedHelp does not write health plans. Add the things you plan to do "
        "and it will help you keep track of them."
    ),
    UNCLEAR: (
        "MedHelp could not tell which activities you meant. You can add them "
        "yourself below."
    ),
}

_NO_PROPOSAL_NOTICE = (
    "MedHelp has no suggestions right now. You can add your activities below."
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

    # `structure` runs first for its refusals, not for its rows. It is the
    # screen that decides whether this goal may be answered with a plan at all,
    # and it is deliberately the stricter of the two readings of the text.
    result = goal_structuring.structure(payload.description)

    # ⛔ A MEDICAL_GOAL is never answered with a plan, and that check has to
    # happen before the planner is asked rather than inside it. "Get my blood
    # pressure down" must reach the person as a refusal even if the planner
    # would happily have proposed walks for it.
    refused_outright = isinstance(result, Refusal) and result.reason == MEDICAL_GOAL

    if not refused_outright:
        # MedHelp proposes its own plan and its own weekly rhythm rather than
        # splitting the person's sentence into rows. Asked for by the
        # repository owner on 2026-09-09.
        #
        # Every row it returns is `generated=True` and reaches the screen
        # labelled "Suggested by MedHelp", the deterministic `_FORBIDDEN` veto
        # still discards a whole plan on one match, and nothing is saved until
        # the person presses save. Those three are what keep this inside what
        # the app may do, and none of them may be removed.
        planned = goal_structuring.suggest_plan(payload.description)
        if isinstance(planned, GoalDraft):
            result = planned
        elif isinstance(planned, Refusal) and planned.reason == MEDICAL_GOAL:
            # The planner read the goal as medical where `structure` did not.
            # The stricter of the two answers wins, in that direction only.
            result = planned
        # Any other planner outcome - an outage, a refusal it could not place,
        # a draft that failed the veto - leaves `result` as `structure` left
        # it. The person's own words are a worse plan than an originated one
        # and a far better screen than an empty editor.

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
                completed_today=activity.id in ticked,
            )
            for activity in goal.activities
        ],
    )
