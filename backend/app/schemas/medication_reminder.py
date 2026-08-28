from pydantic import BaseModel


class MedicationReminderCreate(BaseModel):
    medication_name: str
    dosage: str | None = None
    schedule: str | None = None


class MedicationReminderOut(BaseModel):
    id: str
    medication_name: str
    dosage: str | None
    schedule: str | None

    model_config = {"from_attributes": True}
