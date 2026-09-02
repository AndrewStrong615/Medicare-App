"""
Medication reminders.

Every row here says that a particular person takes a particular medicine at a
particular hour, which is health data about them. The rules from
`api/medications.py` apply unchanged:

* Every query filters on the authenticated user. An unknown medication id and
  someone else's id both return 404, so this cannot be used to discover that a
  record exists.
* Nothing in this module logs medication names, times, or directions.

CLAUDE.md records `GET /medications/reminders` returning every row for every
user as an open finding on an earlier scaffold. That endpoint is written here
for the first time, scoped to the caller from the outset, with a test that a
second user cannot see the first user's reminders.

## Nothing here decides when anyone takes a medicine

`GET /reminders/medications/{id}/suggestion` proposes times. It writes
nothing. Reminders exist only after the client PUTs a set of times the user
has confirmed on screen - see `services/dose_schedule.py` for why the split
matters.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.medication import Medication
from app.models.reminder import MedicationReminder
from app.models.user import User
from app.schemas.reminder import (
    MedicationScheduleOut,
    ReminderOut,
    ReminderScheduleIn,
    SuggestionOut,
)
from app.services.dose_schedule import suggest_times

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _get_owned_medication_or_404(
    medication_id: str, user: User, db: Session
) -> Medication:
    medication = (
        db.query(Medication)
        .filter(Medication.id == medication_id, Medication.user_id == user.id)
        .first()
    )
    if medication is None:
        raise HTTPException(status_code=404, detail="Medication not found.")
    return medication


def _schedule_for(medication: Medication, db: Session) -> MedicationScheduleOut:
    reminders = (
        db.query(MedicationReminder)
        .filter(MedicationReminder.medication_id == medication.id)
        .order_by(MedicationReminder.time_of_day)
        .all()
    )
    return MedicationScheduleOut(
        medication_id=medication.id,
        medication_name=medication.name,
        dosage=medication.dosage,
        frequency=medication.frequency,
        reminders=[ReminderOut.model_validate(reminder) for reminder in reminders],
    )


@router.get("", response_model=list[MedicationScheduleOut])
def list_schedules(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MedicationScheduleOut]:
    """
    Every medication the user has, with whatever reminders it has.

    Medications with no reminders are included, so the screen can offer to set
    some up rather than hiding them.
    """
    medications = (
        db.query(Medication)
        .filter(Medication.user_id == user.id)
        .order_by(Medication.name)
        .all()
    )
    return [_schedule_for(medication, db) for medication in medications]


@router.get("/medications/{medication_id}/suggestion", response_model=SuggestionOut)
def suggestion(
    medication_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SuggestionOut:
    """
    Times MedHelp would propose for this medication. Writes nothing.

    A `recognised: false` answer is a normal result meaning "you choose" - the
    client must render it as guidance, never as a failure.
    """
    medication = _get_owned_medication_or_404(medication_id, user, db)
    proposed = suggest_times(medication.frequency)

    return SuggestionOut(
        recognised=proposed.recognised,
        times=proposed.times,
        doses_per_day=proposed.doses_per_day,
        reason=proposed.reason,
        # Verbatim, always. The user compares the suggestion against this.
        frequency=medication.frequency,
    )


@router.put("/medications/{medication_id}", response_model=MedicationScheduleOut)
def set_schedule(
    medication_id: str,
    payload: ReminderScheduleIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MedicationScheduleOut:
    """
    Replace this medication's reminder times with the confirmed set.

    A replace rather than a merge: the screen shows the whole day's times at
    once, so what the user pressed save on is the whole day's times. An empty
    list turns reminders off for this medication.
    """
    medication = _get_owned_medication_or_404(medication_id, user, db)

    existing = (
        db.query(MedicationReminder)
        .filter(MedicationReminder.medication_id == medication.id)
        .all()
    )
    # Keep the rows for times that are staying, so a time that was switched
    # off stays switched off across an edit to a different time.
    keeping = {reminder.time_of_day: reminder for reminder in existing}

    for time_of_day, reminder in keeping.items():
        if time_of_day not in payload.times:
            db.delete(reminder)

    for time_of_day in payload.times:
        if time_of_day not in keeping:
            db.add(
                MedicationReminder(
                    user_id=user.id,
                    medication_id=medication.id,
                    time_of_day=time_of_day,
                )
            )

    db.commit()
    return _schedule_for(medication, db)


@router.patch("/{reminder_id}", response_model=ReminderOut)
def set_enabled(
    reminder_id: str,
    enabled: bool,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReminderOut:
    """Silence or restore one time without losing it."""
    reminder = (
        db.query(MedicationReminder)
        .filter(
            MedicationReminder.id == reminder_id,
            MedicationReminder.user_id == user.id,
        )
        .first()
    )
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    reminder.enabled = enabled
    db.commit()
    db.refresh(reminder)
    return ReminderOut.model_validate(reminder)


@router.delete(
    "/medications/{medication_id}", status_code=status.HTTP_204_NO_CONTENT
)
def clear_schedule(
    medication_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Turn off every reminder for one medication."""
    medication = _get_owned_medication_or_404(medication_id, user, db)
    db.query(MedicationReminder).filter(
        MedicationReminder.medication_id == medication.id
    ).delete()
    db.commit()
