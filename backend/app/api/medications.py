"""
The user's medication list.

Every row here is health data about one person. Two rules hold throughout:

* Every query filters on the authenticated user. A medication is never
  reachable by id alone — an unknown id and someone else's id both return 404,
  so the endpoint cannot be used to discover that a record exists.
* Nothing in this module logs medication names, dosages, or notes.

## Two different refill claims live here, and they are not the same thing

`refill_date` / `refill_due_soon` is a date the *user wrote down*. It is a
fact about what they were told, and the seven-day window on it is a fixed
reminder to act.

`refill_estimate` is arithmetic MedHelp does from a quantity, a count date and
a doses-per-day figure — see `services/refill_forecast.py`. It assumes every
dose is taken on schedule, which MedHelp has no way to check and must not
imply it can. It is labelled an estimate everywhere it surfaces and has its
own caller-configurable lead time.

⛔ Do not collapse them into one field. One is a record; the other is a guess.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.medication import Medication
from app.models.reminder import MedicationReminder
from app.models.user import User
from app.schemas.medication import (
    REFILL_LEAD_DAYS_DEFAULT,
    REFILL_LEAD_DAYS_MAX,
    REFILL_LEAD_DAYS_MIN,
    REFILL_SOON_DAYS,
    MedicationCreate,
    MedicationOut,
    MedicationUpdate,
    RefillEstimateOut,
)
from app.services.refill_forecast import clamp_lead_days, forecast

router = APIRouter(prefix="/medications", tags=["medications"])


def _to_out(
    medication: Medication,
    *,
    today: date | None = None,
    enabled_reminder_count: int = 0,
    lead_days: int = REFILL_LEAD_DAYS_DEFAULT,
) -> MedicationOut:
    today = today or date.today()

    days_until_refill: int | None = None
    refill_due_soon = False
    refill_overdue = False

    if medication.refill_date is not None:
        days_until_refill = (medication.refill_date - today).days
        refill_overdue = days_until_refill < 0
        # "Due soon" covers today through the window; an overdue refill is
        # reported separately so the UI can say something different about it.
        refill_due_soon = 0 <= days_until_refill <= REFILL_SOON_DAYS

    estimate = forecast(
        quantity_remaining=medication.quantity_remaining,
        quantity_counted_on=medication.quantity_counted_on,
        doses_per_day=medication.doses_per_day,
        enabled_reminder_count=enabled_reminder_count,
        today=today,
        lead_days=lead_days,
    )

    return MedicationOut(
        id=medication.id,
        name=medication.name,
        dosage=medication.dosage,
        frequency=medication.frequency,
        prescribing_doctor=medication.prescribing_doctor,
        refill_date=medication.refill_date,
        notes=medication.notes,
        quantity_remaining=medication.quantity_remaining,
        quantity_counted_on=medication.quantity_counted_on,
        doses_per_day=medication.doses_per_day,
        refill_due_soon=refill_due_soon,
        refill_overdue=refill_overdue,
        days_until_refill=days_until_refill,
        refill_estimate=RefillEstimateOut(
            run_out_on=estimate.run_out_on,
            days_remaining=estimate.days_remaining,
            alert=estimate.alert,
            is_estimate=estimate.is_estimate,
            doses_per_day=estimate.doses_per_day,
            doses_per_day_source=estimate.doses_per_day_source,
            reason=estimate.reason,
            lead_days=lead_days,
        ),
    )


def _enabled_reminder_counts(user: User, db: Session) -> dict[str, int]:
    """
    How many enabled reminder times each of this user's medications has.

    One grouped query rather than one per medication: the list endpoint would
    otherwise issue a query per row purely to work out a doses-per-day
    fallback.
    """
    rows = (
        db.query(
            MedicationReminder.medication_id,
            func.count(MedicationReminder.id),
        )
        .filter(
            MedicationReminder.user_id == user.id,
            MedicationReminder.enabled.is_(True),
        )
        .group_by(MedicationReminder.medication_id)
        .all()
    )
    return {medication_id: count for medication_id, count in rows}


def _enabled_reminder_count(medication: Medication, db: Session) -> int:
    return (
        db.query(func.count(MedicationReminder.id))
        .filter(
            MedicationReminder.medication_id == medication.id,
            MedicationReminder.enabled.is_(True),
        )
        .scalar()
        or 0
    )


def _get_owned_or_404(medication_id: str, user: User, db: Session) -> Medication:
    medication = (
        db.query(Medication)
        .filter(Medication.id == medication_id, Medication.user_id == user.id)
        .first()
    )
    if medication is None:
        raise HTTPException(status_code=404, detail="Medication not found.")
    return medication


@router.get("", response_model=list[MedicationOut])
def list_medications(
    refill_lead_days: int = Query(
        REFILL_LEAD_DAYS_DEFAULT,
        ge=REFILL_LEAD_DAYS_MIN,
        le=REFILL_LEAD_DAYS_MAX,
        description=(
            "How many days before the estimated run-out date a medication is "
            "flagged. The user's own setting; it lives on their device rather "
            "than in a settings table here."
        ),
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MedicationOut]:
    medications = (
        db.query(Medication)
        .filter(Medication.user_id == user.id)
        .order_by(Medication.name)
        .all()
    )
    counts = _enabled_reminder_counts(user, db)
    lead_days = clamp_lead_days(refill_lead_days)

    return [
        _to_out(
            medication,
            enabled_reminder_count=counts.get(medication.id, 0),
            lead_days=lead_days,
        )
        for medication in medications
    ]


@router.post("", response_model=MedicationOut, status_code=status.HTTP_201_CREATED)
def create_medication(
    payload: MedicationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MedicationOut:
    medication = Medication(user_id=user.id, **payload.model_dump())
    db.add(medication)
    db.commit()
    db.refresh(medication)
    return _to_out(medication)


@router.get("/{medication_id}", response_model=MedicationOut)
def get_medication(
    medication_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MedicationOut:
    medication = _get_owned_or_404(medication_id, user, db)
    return _to_out(
        medication,
        enabled_reminder_count=_enabled_reminder_count(medication, db),
    )


@router.put("/{medication_id}", response_model=MedicationOut)
def update_medication(
    medication_id: str,
    payload: MedicationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MedicationOut:
    medication = _get_owned_or_404(medication_id, user, db)

    for field, value in payload.model_dump().items():
        setattr(medication, field, value)

    db.commit()
    db.refresh(medication)
    return _to_out(
        medication,
        enabled_reminder_count=_enabled_reminder_count(medication, db),
    )


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medication(
    medication_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    medication = _get_owned_or_404(medication_id, user, db)

    # Take the reminders with it. The foreign key cascades on Postgres, but
    # doing it here as well means the rows go whatever the database enforces —
    # and a leftover reminder is not an untidy row, it is an alarm telling
    # someone to take a medication they have stopped.
    db.query(MedicationReminder).filter(
        MedicationReminder.medication_id == medication.id
    ).delete()

    db.delete(medication)
    db.commit()
