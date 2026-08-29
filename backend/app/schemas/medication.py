from datetime import date

from pydantic import BaseModel, Field, field_validator

# A refill is flagged this far ahead so there is time to contact a pharmacy
# or prescriber before running out.
REFILL_SOON_DAYS = 7


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class MedicationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    dosage: str | None = Field(None, max_length=120)
    frequency: str | None = Field(None, max_length=120)
    prescribing_doctor: str | None = Field(None, max_length=200)
    refill_date: date | None = None
    notes: str | None = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Enter the medication name.")
        return cleaned

    @field_validator("dosage", "frequency", "prescribing_doctor", "notes")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return _clean_optional(value)


class MedicationCreate(MedicationBase):
    pass


class MedicationUpdate(MedicationBase):
    """Full replacement of the editable fields."""


class MedicationOut(MedicationBase):
    id: str
    # Derived server-side so every client flags refills identically rather
    # than each reimplementing the date arithmetic.
    refill_due_soon: bool
    refill_overdue: bool
    days_until_refill: int | None

    model_config = {"from_attributes": True}
