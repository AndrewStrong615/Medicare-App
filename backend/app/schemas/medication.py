from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.refill_forecast import (
    REFILL_LEAD_DAYS_DEFAULT,
    REFILL_LEAD_DAYS_MAX,
    REFILL_LEAD_DAYS_MIN,
)

# A refill is flagged this far ahead so there is time to contact a pharmacy
# or prescriber before running out.
#
# This is the window on `refill_date` — a date the user wrote down. The
# supply *estimate* has its own, separately configurable, lead time; see
# `services/refill_forecast.py`. The two are different claims and deliberately
# do not share a number.
REFILL_SOON_DAYS = 7

# More than this stops being a medication supply and starts being a data-entry
# slip. Rejected rather than projected from.
MAX_QUANTITY_REMAINING = 10_000
MAX_DOSES_PER_DAY = 24

__all__ = [
    "MAX_DOSES_PER_DAY",
    "MAX_QUANTITY_REMAINING",
    "REFILL_LEAD_DAYS_DEFAULT",
    "REFILL_LEAD_DAYS_MAX",
    "REFILL_LEAD_DAYS_MIN",
    "REFILL_SOON_DAYS",
    "MedicationCreate",
    "MedicationOut",
    "MedicationUpdate",
]


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

    # --- Supply, for the run-out estimate.
    #
    # `doses_per_day` is a number the user gives. ⛔ It is never parsed out of
    # `frequency`: decoding printed directions into a dose count is
    # app-authored clinical content, and a wrong expansion changes when
    # someone takes a medicine. Left null, the forecast falls back to the
    # reminder times the user confirmed.
    quantity_remaining: int | None = Field(None, ge=0, le=MAX_QUANTITY_REMAINING)
    quantity_counted_on: date | None = None
    doses_per_day: int | None = Field(None, ge=1, le=MAX_DOSES_PER_DAY)

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

    @model_validator(mode="after")
    def _quantity_needs_a_date(self) -> "MedicationBase":
        """
        A count with no date is a count that cannot go stale, which is worse
        than no count at all — the projection would keep reporting the same
        answer forever. The client normally sends today; this fills it in when
        it does not, so the record always says when the number was true.
        """
        if self.quantity_remaining is not None and self.quantity_counted_on is None:
            self.quantity_counted_on = date.today()
        return self


class MedicationCreate(MedicationBase):
    pass


class MedicationUpdate(MedicationBase):
    """Full replacement of the editable fields."""


class RefillEstimateOut(BaseModel):
    """
    When this medication is estimated to run out.

    ⛔ `is_estimate` is always true when there is a date at all, and clients
    must render it as one. The projection assumes every dose is taken exactly
    on schedule; MedHelp does not track doses and must not imply it can, so
    the number can be wrong in both directions.

    `run_out_on: null` means no estimate is being offered, with `reason`
    saying why in words meant for the user. It is never an error, and the UI
    must not fill the gap.
    """

    run_out_on: date | None
    days_remaining: int | None
    # True when the run-out date is inside the caller's lead time, including
    # when it has already passed.
    alert: bool
    is_estimate: bool
    # What the estimate rests on, so the user can see it and correct it.
    doses_per_day: int | None
    doses_per_day_source: str | None
    reason: str | None
    # Echoed back so a client never has to remember what it asked for to
    # explain the answer it got.
    lead_days: int


class MedicationOut(MedicationBase):
    id: str
    # Derived server-side so every client flags refills identically rather
    # than each reimplementing the date arithmetic.
    refill_due_soon: bool
    refill_overdue: bool
    days_until_refill: int | None
    refill_estimate: RefillEstimateOut

    model_config = {"from_attributes": True}
