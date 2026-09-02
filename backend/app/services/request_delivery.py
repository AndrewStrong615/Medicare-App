"""
Sending an appointment request to a provider. NOT IMPLEMENTED, ON PURPOSE.

This module is a named seam, not a stub waiting to be filled in by whoever
reads it next. Delivering a request means transmitting a reason-for-visit —
free text about someone's symptoms — plus their name and phone number to a
third party. That is PHI leaving the app, and CLAUDE.md is explicit that this
project has no BAA with any vendor.

Every plausible channel is therefore blocked on a signed agreement, not on
engineering:

* Email (SendGrid, Postmark, SES) — all will sign a BAA; none is signed.
* Fax (Documo, Phaxio, Twilio) — still how most US practices take referrals.
  Same position: BAA available, none signed.
* A booking API (Zocdoc, an Epic-hosted scheduling endpoint) — needs a
  partnership and per-provider opt-in as well as a BAA. See the research notes
  in docs/appointment-booking.md.

Until one of those exists, `deliver_request` raises. It is deliberately not a
silent no-op: a function that quietly returned success would let a caller show
the user "your request has been sent" when nothing was sent, which is the
specific failure mode this design exists to prevent. Nothing in the API calls
it today; the appointments endpoint records `delivery_state="NOT_SENT"` and
the UI tells the user, in as many words, that they still need to phone.
"""

from app.models.appointment import Appointment
from app.schemas.booking_identity import BookingIdentity


class DeliveryUnavailable(RuntimeError):
    """Raised because no BAA-covered channel to a provider exists."""


def delivery_available() -> bool:
    """
    Whether MedHelp can transmit a request to a provider.

    Always False. When a channel is procured this becomes a real check on its
    configuration, in the same shape as `triage.credentials_available()`.

    Everything downstream reads this rather than assuming: the API refuses to
    accept an identity while it is False, and the app never renders the form
    that would collect one. Flipping it is therefore the single switch that
    turns the booking path on — and it must not be flipped before the BAA it
    stands for actually exists.
    """
    return False


def deliver_request(appointment: Appointment, identity: BookingIdentity) -> None:
    """
    Send `appointment` to its provider, on behalf of `identity`.

    Currently always raises.

    ## Why identity is a separate argument

    `appointment` is a stored row. `identity` is not stored anywhere and never
    will be — it is built from one request and discarded (see
    `app/schemas/booking_identity.py`). Keeping them as two parameters keeps
    that difference visible at every call site: anything reachable from
    `appointment` is in the database, and anything reachable from `identity` is
    not, and must not become so.

    A future implementation should also minimise rather than forward wholesale.
    The reason-for-visit in particular is free text a user wrote for a triage
    question; most scheduling APIs want a visit-reason code, not prose.
    """
    raise DeliveryUnavailable(
        "MedHelp cannot contact providers yet: no BAA-covered delivery "
        "channel is configured."
    )
