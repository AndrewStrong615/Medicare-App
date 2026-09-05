"""
The user's appointments - the tracking feature, and the destination of the
"request an appointment" flow.

Every row here is health data about one person. The same two rules as
`medications` hold throughout:

* Every query filters on the authenticated user. An appointment is never
  reachable by id alone - an unknown id and someone else's id both return 404,
  so the endpoint cannot be used to discover that a record exists.
* Nothing in this module logs the reason for visit, the provider, or the notes.

One rule is specific to this module: **creating an appointment contacts
nobody.** It writes a row and returns it. MedHelp has no BAA-covered channel to
a provider (see `app/services/request_delivery.py`), so `delivery_state` is
NOT_SENT on every row this code can produce, and `provider_notified` is False.
The user still has to phone, and the UI says so.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.appointment import Appointment
from app.models.user import User
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
)
from app.schemas.booking_identity import BookingIdentity
from app.services.request_delivery import (
    DeliveryUnavailable,
    deliver_request,
    delivery_available,
)

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _to_out(appointment: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=appointment.id,
        provider_name=appointment.provider_name,
        provider_npi=appointment.provider_npi,
        provider_specialty=appointment.provider_specialty,
        provider_phone=appointment.provider_phone,
        provider_address=appointment.provider_address,
        reason_for_visit=appointment.reason_for_visit,
        preferred_time=appointment.preferred_time,
        urgency_tier=appointment.urgency_tier,
        source_assessment_id=appointment.source_assessment_id,
        notes=appointment.notes,
        status=appointment.status,
        delivery_state=appointment.delivery_state,
        created_at=appointment.created_at,
        # Never inferred from `status`. A row can be SCHEDULED because the
        # user rang the clinic themselves and said so, which tells us nothing
        # about whether MedHelp transmitted anything - and it did not.
        provider_notified=appointment.delivery_state == "SENT",
    )


def _get_owned_or_404(appointment_id: str, user: User, db: Session) -> Appointment:
    appointment = (
        db.query(Appointment)
        .filter(Appointment.id == appointment_id, Appointment.user_id == user.id)
        .first()
    )
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found.")
    return appointment


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[AppointmentOut]:
    appointments = (
        db.query(Appointment)
        .filter(Appointment.user_id == user.id)
        .order_by(Appointment.created_at.desc())
        .all()
    )
    return [_to_out(appointment) for appointment in appointments]


@router.post("", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppointmentOut:
    """
    Record an appointment the user intends to attend.

    `status` and `delivery_state` are set here, not by the client. Letting a
    caller post `status="SCHEDULED"` or `delivery_state="SENT"` would let a
    screen claim a booking exists when nothing outside this database knows
    about it.
    """
    appointment = Appointment(
        user_id=user.id,
        status="REQUESTED",
        delivery_state="NOT_SENT",
        **payload.model_dump(),
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return _to_out(appointment)


@router.get("/capabilities", response_model=dict[str, bool])
def booking_capabilities(
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    """
    What the appointment feature can currently do.

    DECLARED BEFORE `/{appointment_id}`: FastAPI matches routes in declaration
    order, so the other way round this path is swallowed by the id route and
    "capabilities" is looked up as an appointment id.

    The app reads `online_booking` from here rather than assuming. While it is
    false the identity form is unreachable, so the fields a booking needs -
    name, date of birth, address - are never collected. On the day a
    BAA-covered channel exists, one flag turns the path on.
    """
    return {"online_booking": delivery_available()}


@router.post("/{appointment_id}/submit", response_model=AppointmentOut)
def submit_appointment(
    appointment_id: str,
    identity: BookingIdentity,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppointmentOut:
    """
    Send an appointment to its provider, with the patient identity a booking
    requires. **Currently always refuses**, because no channel exists.

    This is the only route in the app that accepts a `BookingIdentity`, and the
    only place one is ever constructed. It:

    * refuses before reading the body's meaning if delivery is unavailable, so
      no identity is processed while there is nowhere to send it;
    * never writes any identity field to the database — `Appointment` has no
      column that could hold one, which a test asserts;
    * never returns it. The response is the ordinary `AppointmentOut`, so
      nothing echoes a date of birth back into a client log.

    The 503 is not a failure to be retried. It is the standing state of this
    endpoint until a BAA-covered delivery channel is procured.
    """
    appointment = _get_owned_or_404(appointment_id, user, db)

    if not delivery_available():
        # Checked here rather than after attempting delivery so the refusal
        # does not depend on `deliver_request` raising correctly. Two
        # independent guards, because the cost of getting this wrong is
        # transmitting PHI to a vendor with no agreement in place.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "MedHelp can't send appointment requests to providers yet. "
                "Please call the provider to arrange a time."
            ),
        )

    try:
        deliver_request(appointment, identity)
    except DeliveryUnavailable as exc:
        appointment.delivery_state = "FAILED"
        db.commit()
        db.refresh(appointment)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "MedHelp couldn't send this request. Please call the provider "
                "to arrange a time."
            ),
        ) from exc

    appointment.delivery_state = "SENT"
    db.commit()
    db.refresh(appointment)
    return _to_out(appointment)


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppointmentOut:
    return _to_out(_get_owned_or_404(appointment_id, user, db))


@router.put("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: str,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AppointmentOut:
    """
    Update the parts of an appointment the user owns: its status, when they
    are going, and their own notes.

    The provider and the reason for visit are not editable. Those are the
    record of what was requested and from whom; editing them in place would
    quietly rewrite history on a row a clinician might later be reading.
    Delete and re-add instead.
    """
    appointment = _get_owned_or_404(appointment_id, user, db)

    appointment.status = payload.status
    appointment.preferred_time = payload.preferred_time
    appointment.notes = payload.notes

    db.commit()
    db.refresh(appointment)
    return _to_out(appointment)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    appointment = _get_owned_or_404(appointment_id, user, db)
    db.delete(appointment)
    db.commit()
