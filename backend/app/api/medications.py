"""
Medication reminders — CRUD stub.

medication_name/dosage/schedule are flagged in CLAUDE.md for encryption at
rest before this holds real user data; not implemented in this scaffold.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.medication_reminder import MedicationReminder
from app.schemas.medication_reminder import (
    MedicationReminderCreate,
    MedicationReminderOut,
)

router = APIRouter(prefix="/medications", tags=["medications"])


@router.get("/reminders", response_model=list[MedicationReminderOut])
def list_reminders(db: Session = Depends(get_db)) -> list[MedicationReminder]:
    # TODO: scope to authenticated user once auth dependency is wired into
    # protected routes.
    return db.query(MedicationReminder).all()


@router.post(
    "/reminders",
    response_model=MedicationReminderOut,
    status_code=status.HTTP_201_CREATED,
)
def create_reminder(
    payload: MedicationReminderCreate, db: Session = Depends(get_db)
) -> MedicationReminder:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Creating medication reminders is not implemented yet.",
    )
