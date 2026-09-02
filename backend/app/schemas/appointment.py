from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.appointment import APPOINTMENT_STATUSES
from app.services.provider_directory import CARE_SETTINGS


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class ProviderOut(BaseModel):
    """
    One provider from the NPPES directory.

    Deliberately has no `next_available` / `slots` field. NPPES publishes no
    availability, and no other source is wired up, so there is no honest value
    to put in one. See `app/services/provider_directory.py`.
    """

    npi: str
    name: str
    specialty: str | None
    phone: str | None
    address: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    # Carried on every row so the UI can attribute the directory, the same way
    # MedlinePlus results carry theirs.
    source_name: str
    # Straight-line miles from the searched ZIP's centroid to this provider's,
    # or None when either ZIP is not a known ZCTA.
    #
    # Computed here rather than on the device because the device cannot always
    # do it: a browser has no geocoder, so web builds showed no distances at
    # all. The backend already knows both ZIPs, so this reveals nothing new.
    # It is an estimate between centroids, never a driving distance - the UI
    # renders it with a "~".
    distance_miles: float | None = None


class ResolveLocationIn(BaseModel):
    """
    A coordinate from the browser's Geolocation API, to be turned into a ZIP.

    Sent as a POST body, never a query string, so a user's position does not
    land in access logs, proxies or crash reporters - the same rule the symptom
    description follows. It is resolved against a local Census dataset and is
    not stored or forwarded anywhere.
    """

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class ResolveLocationOut(BaseModel):
    # None when the coordinate is not plausibly near any US ZIP - someone
    # outside the country, or a bad fix. The client then asks the user to type
    # a ZIP rather than showing providers on the wrong continent.
    postal_code: str | None


class ProviderSearchOut(BaseModel):
    providers: list[ProviderOut]
    care_setting: str
    postal_code: str
    # True when MedHelp can transmit a request to a provider on the user's
    # behalf. Always False today; the UI reads this rather than hard-coding
    # the assumption, so the screens tell the truth on the day it changes.
    online_booking_available: bool


class AppointmentBase(BaseModel):
    provider_name: str = Field(..., min_length=1, max_length=300)
    provider_npi: str | None = Field(None, max_length=20)
    provider_specialty: str | None = Field(None, max_length=200)
    provider_phone: str | None = Field(None, max_length=40)
    provider_address: str | None = Field(None, max_length=400)

    reason_for_visit: str | None = Field(None, max_length=2000)
    preferred_time: str | None = Field(None, max_length=200)

    urgency_tier: str | None = Field(None, max_length=20)
    source_assessment_id: str | None = None

    notes: str | None = Field(None, max_length=2000)

    @field_validator("provider_name")
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Choose a provider.")
        return cleaned

    @field_validator(
        "provider_npi",
        "provider_specialty",
        "provider_phone",
        "provider_address",
        "reason_for_visit",
        "preferred_time",
        "notes",
    )
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return _clean_optional(value)

    @field_validator("urgency_tier")
    @classmethod
    def _known_tier(cls, value: str | None) -> str | None:
        """
        Accept only a tier this app produces, and only as a label.

        This value is copied from a completed intake result so the user does
        not retype why they are booking. It is never fed back into triage:
        nothing downstream re-derives urgency from it, and CLAUDE.md forbids
        this module touching the triage layer at all.
        """
        cleaned = _clean_optional(value)
        if cleaned is None:
            return None
        upper = cleaned.upper()
        if upper not in {"EMERGENT", "URGENT", "SELF_CARE"}:
            raise ValueError("Unknown urgency tier.")
        return upper


class AppointmentCreate(AppointmentBase):
    """
    Record an appointment the user intends to attend.

    Always lands as status REQUESTED with delivery_state NOT_SENT. The client
    cannot set either: an appointment is only "SCHEDULED" once the user has
    actually spoken to the provider, and only they can say so.
    """


class AppointmentUpdate(BaseModel):
    """Full replacement of the fields a user may edit after the fact."""

    status: str = Field(..., max_length=20)
    preferred_time: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=2000)

    @field_validator("preferred_time", "notes")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        return _clean_optional(value)

    @field_validator("status")
    @classmethod
    def _known_status(cls, value: str) -> str:
        upper = value.strip().upper()
        if upper not in APPOINTMENT_STATUSES:
            raise ValueError("Unknown appointment status.")
        return upper


class AppointmentOut(AppointmentBase):
    id: str
    status: str
    delivery_state: str
    created_at: datetime

    # Restates `delivery_state` as the single question the UI actually needs to
    # answer: may this screen tell the user the provider knows? Derived here so
    # every client answers it identically, and so no screen has to infer it
    # from a status string it might read too optimistically.
    provider_notified: bool


CARE_SETTING_KEYS = tuple(CARE_SETTINGS)
