"""
The user's medication list.

Every row here is health data about one person. Two rules hold throughout:

* Every query filters on the authenticated user. A medication is never
  reachable by id alone — an unknown id and someone else's id both return 404,
  so the endpoint cannot be used to discover that a record exists.
* Nothing in this module logs medication names, dosages, or notes.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.medication import Medication
from app.models.user import User
from app.schemas.medication import (
    REFILL_SOON_DAYS,
    MedicationCreate,
    MedicationOut,
    MedicationUpdate,
)

router = APIRouter(prefix="/medications", tags=["medications"])


def _to_out(medication: Medication, *, today: date | None = None) -> MedicationOut:
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

    return MedicationOut(
        id=medication.id,
        name=medication.name,
        dosage=medication.dosage,
        frequency=medication.frequency,
        prescribing_doctor=medication.prescribing_doctor,
        refill_date=medication.refill_date,
        notes=medication.notes,
        refill_due_soon=refill_due_soon,
        refill_overdue=refill_overdue,
        days_until_refill=days_until_refill,
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MedicationOut]:
    medications = (
        db.query(Medication)
        .filter(Medication.user_id == user.id)
        .order_by(Medication.name)
        .all()
    )
    return [_to_out(medication) for medication in medications]


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
    return _to_out(_get_owned_or_404(medication_id, user, db))


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
    return _to_out(medication)


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_medication(
    medication_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    medication = _get_owned_or_404(medication_id, user, db)
    db.delete(medication)
    db.commit()
