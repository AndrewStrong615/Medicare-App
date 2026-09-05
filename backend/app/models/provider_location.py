from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProviderLocation(Base):
    """
    Where one provider's practice address actually is, cached by NPI.

    ## What this table holds, and what it must never hold

    **Public business data only.** An NPI and the coordinate of a clinic's
    front door, derived from the street address NPPES already publishes.

    There is no user column here, and there must never be one. This is a cache
    of facts about *providers*, not a record of anybody's searches: adding a
    `user_id`, a timestamp of who looked, or a search term would turn a table
    of public addresses into a log of which clinics a named person was looking
    for, which is health data about them. Nothing in the app writes such a
    column and nothing may.

    That is also why this table is exempt from the encryption-at-rest finding
    that covers `medications`, `intake_assessments` and `appointments` - there
    is nothing here that is not already published by CMS.

    ## Why it is cached at all

    Two reasons, in this order:

    1. **Privacy.** A geocoding request reveals which area was searched,
       because the addresses in one batch share a locality. A provider's
       address does not move, so re-sending it on every search would leak that
       signal repeatedly for no benefit.
    2. **Speed and courtesy.** The Census geocoder is a free public service.
       Asking it the same question on every page load would be rude and slow.

    ## Null coordinates are an answer, not a gap

    `latitude`/`longitude` are null when the geocoder was asked and could not
    place the address - a suite-only address, a PO box, a typo in the registry.
    Storing that stops the same unplaceable address being re-sent on every
    search. It is re-checked after `NEGATIVE_RETRY_DAYS` so a registry
    correction is eventually picked up. A provider that has never been asked
    about has **no row at all**, which is a different state and is why the
    absence of a row, not a null, is what triggers a lookup.
    """

    __tablename__ = "provider_locations"

    # The NPI is the registry's own stable identifier for a provider, so it is
    # the natural key. No surrogate id: there is nothing to relate this to.
    npi: Mapped[str] = mapped_column(String(20), primary_key=True)

    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    # What the geocoder was asked, so a provider that relocates can be spotted
    # and re-placed rather than being shown at their old address forever.
    geocoded_address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def has_coordinates(self) -> bool:
        return self.latitude is not None and self.longitude is not None
