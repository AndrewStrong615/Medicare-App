"""
Who is coming to the appointment.

## This is the one structure in the app that must never be persisted

A scheduling API cannot book without identifying the patient to the clinic:
Zocdoc's booking call requires legal name, date of birth, sex assigned at
birth, phone, email and full address. That is not a design preference, it is
how a provider matches a person to a patient record.

MedHelp's answer is **pass-through**: these fields are built from one request,
handed to the delivery layer, and dropped. They are never written to a table,
never put in a log, and never returned in a response.

Consequences that anyone touching this must preserve:

* There is **no `BookingIdentity` SQLAlchemy model**, and `appointments` has no
  column that could hold one of these fields. A test asserts that.
* Do not add `identity` to `AppointmentOut`. Echoing it back would put it in
  client logs and crash reporters, which is most of the exposure that not
  storing it was meant to avoid.
* Do not log it. `triage_log` exists for classifier tuning and is already
  forbidden in production; nothing comparable may exist for this.
* The user retypes it per booking. That is the accepted cost, and it is small
  next to holding a table of names, dates of birth and home addresses in a
  database that has no encryption at rest.

## Pass-through is not the same as "not liable"

Transmitting this to a third party makes that vendor a processor of PHI just as
surely as storing it would. Pass-through shrinks the breach radius; it does not
remove the BAA requirement. `request_delivery.delivery_available()` is the gate
that holds until one exists.
"""

from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator

# What a scheduling API needs to distinguish a returning patient from a new
# one. Kept as a closed set rather than a free string so it cannot become a
# place to smuggle a note about the person.
PATIENT_TYPES = ("NEW", "EXISTING")

# Recorded because booking APIs require it, not because MedHelp has any use
# for it. It is sex assigned at birth as a clinic's record system defines it,
# which is a different question from a person's gender, and the app asks it
# only because a booking cannot be placed without it.
SEXES_ASSIGNED_AT_BIRTH = ("FEMALE", "MALE", "INTERSEX", "UNSPECIFIED")


class BookingIdentity(BaseModel):
    """
    Patient identity for one booking attempt. In memory only.

    `model_config` deliberately does not enable `from_attributes`: there is no
    ORM object to build one of these from, and there must never be.
    """

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    date_of_birth: date
    sex_assigned_at_birth: str = Field(..., max_length=20)

    phone: str = Field(..., max_length=20)
    email: EmailStr

    address_line: str = Field(..., min_length=1, max_length=200)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=2, max_length=2)
    postal_code: str = Field(..., max_length=10)

    patient_type: str = Field("NEW", max_length=20)

    @field_validator("first_name", "last_name", "address_line", "city")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("This field is required to book.")
        return cleaned

    @field_validator("date_of_birth")
    @classmethod
    def _plausible_birth_date(cls, value: date) -> date:
        # A future date of birth is a typo, and a booking made under it would
        # fail at the clinic rather than here. Nothing beyond plausibility is
        # checked: judging a date of birth is not this app's business.
        if value > date.today():
            raise ValueError("Enter a date of birth in the past.")
        return value

    @field_validator("sex_assigned_at_birth")
    @classmethod
    def _known_sex(cls, value: str) -> str:
        upper = value.strip().upper()
        if upper not in SEXES_ASSIGNED_AT_BIRTH:
            raise ValueError("Choose one of the listed options.")
        return upper

    @field_validator("patient_type")
    @classmethod
    def _known_patient_type(cls, value: str) -> str:
        upper = value.strip().upper()
        if upper not in PATIENT_TYPES:
            raise ValueError("Choose whether you have been seen here before.")
        return upper

    @field_validator("phone")
    @classmethod
    def _ten_digits(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) != 10:
            raise ValueError("Enter a 10-digit phone number.")
        return digits

    @field_validator("state")
    @classmethod
    def _state_code(cls, value: str) -> str:
        upper = value.strip().upper()
        if len(upper) != 2 or not upper.isalpha():
            raise ValueError("Enter a 2-letter state code.")
        return upper

    @field_validator("postal_code")
    @classmethod
    def _zip5(cls, value: str) -> str:
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) < 5:
            raise ValueError("Enter a 5-digit ZIP code.")
        return digits[:5]

    def __repr__(self) -> str:
        """
        Redacted on purpose.

        The default pydantic repr prints every field, so this object would leak
        a name, date of birth and home address into any traceback, debugger
        session or `logger.exception` that happened to touch a frame holding
        one. That is the accident this class exists to prevent, so the repr
        does not carry the data.
        """
        return "BookingIdentity(<redacted>)"

    __str__ = __repr__
