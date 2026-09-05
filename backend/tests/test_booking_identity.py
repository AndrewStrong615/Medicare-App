"""
The pass-through invariant for patient identity.

The design decision these guard: a booking API needs legal name, date of birth,
sex assigned at birth and home address, and MedHelp handles those **without
storing them**. Every test here exists to make that property enforceable rather
than merely intended - the sort of thing that otherwise erodes the first time
somebody adds a convenience column.

All fixtures are synthetic people.
"""

from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from app.models.appointment import Appointment
from app.schemas.appointment import AppointmentOut
from app.schemas.booking_identity import BookingIdentity

SYNTHETIC_IDENTITY = {
    "first_name": "Synthetic",
    "last_name": "Testperson",
    "date_of_birth": "1985-04-12",
    "sex_assigned_at_birth": "FEMALE",
    "phone": "212-555-0143",
    "email": "synthetic.testperson@example.com",
    "address_line": "1 Synthetic Plaza",
    "city": "New York",
    "state": "ny",
    "postal_code": "10001-1810",
}

SYNTHETIC_APPOINTMENT = {
    "provider_name": "Synthetic Urgent Care LLC",
    "provider_npi": "1000000001",
    "reason_for_visit": "Sore throat and a fever since Tuesday.",
}

# Every field of an identity, as stored on the model would be named. If one of
# these ever becomes a column, the pass-through design has been abandoned.
IDENTITY_FIELDS = set(BookingIdentity.model_fields)


class TestNothingPersistsIdentity:
    def test_the_appointment_table_has_no_column_that_could_hold_identity(self):
        """
        The structural guarantee, checked against the mapped table rather than
        the class, so a column added by any route is caught.
        """
        columns = {column.name for column in Appointment.__table__.columns}
        overlap = columns & IDENTITY_FIELDS
        assert overlap == set(), (
            f"Appointment gained identity column(s): {sorted(overlap)}. "
            "Patient identity is pass-through and must not be stored."
        )

    def test_no_column_is_named_after_a_person(self):
        """
        Catches the near-misses the exact-name check above would let through -
        `patient_name`, `dob`, `patient_address` and friends.
        """
        columns = {column.name for column in Appointment.__table__.columns}
        forbidden = {
            "patient_name",
            "patient_first_name",
            "patient_last_name",
            "dob",
            "birth_date",
            "patient_dob",
            "patient_address",
            "patient_phone",
            "patient_email",
            "sex",
            "gender",
        }
        assert columns & forbidden == set()

    def test_the_appointment_response_never_carries_identity(self):
        """
        Echoing identity back would put a date of birth into client logs and
        crash reporters - most of the exposure that not storing it avoids.
        """
        assert set(AppointmentOut.model_fields) & IDENTITY_FIELDS == set()

    def test_there_is_no_identity_model(self):
        """
        `BookingIdentity` is a pydantic schema, not a mapped table. If someone
        turns it into a SQLAlchemy model this fails.
        """
        assert not hasattr(BookingIdentity, "__table__")
        assert not hasattr(BookingIdentity, "__tablename__")


class TestIdentityDoesNotLeakThroughRepr:
    def test_repr_does_not_print_the_person(self):
        """
        pydantic's default repr prints every field, so an identity in a frame
        would leak a name, date of birth and home address into any traceback
        or `logger.exception` that touched it.
        """
        identity = BookingIdentity(**SYNTHETIC_IDENTITY)
        printed = f"{identity!r} {identity}"

        assert "Testperson" not in printed
        assert "1985-04-12" not in printed
        assert "Synthetic Plaza" not in printed
        assert "redacted" in printed.lower()


class TestValidation:
    def test_normalises_what_a_scheduling_api_expects(self):
        identity = BookingIdentity(**SYNTHETIC_IDENTITY)

        assert identity.phone == "2125550143"
        assert identity.state == "NY"
        assert identity.postal_code == "10001"
        assert identity.patient_type == "NEW"

    def test_strips_a_country_code_from_the_phone(self):
        identity = BookingIdentity(**{**SYNTHETIC_IDENTITY, "phone": "1 (212) 555-0143"})
        assert identity.phone == "2125550143"

    def test_rejects_a_future_date_of_birth(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        with pytest.raises(ValidationError):
            BookingIdentity(**{**SYNTHETIC_IDENTITY, "date_of_birth": tomorrow})

    def test_rejects_an_unlisted_sex_assigned_at_birth(self):
        with pytest.raises(ValidationError):
            BookingIdentity(
                **{**SYNTHETIC_IDENTITY, "sex_assigned_at_birth": "something else"}
            )

    def test_rejects_a_short_phone_number(self):
        with pytest.raises(ValidationError):
            BookingIdentity(**{**SYNTHETIC_IDENTITY, "phone": "555-0143"})


class TestSubmitEndpoint:
    def _create(self, client, headers):
        response = client.post(
            "/appointments", json=SYNTHETIC_APPOINTMENT, headers=headers
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    def test_submitting_refuses_while_no_channel_exists(self, client, auth_headers):
        """
        The standing state of this endpoint. 503, with a message that tells the
        user what to do instead - not a generic error inviting a retry loop.
        """
        appointment_id = self._create(client, auth_headers)

        response = client.post(
            f"/appointments/{appointment_id}/submit",
            json=SYNTHETIC_IDENTITY,
            headers=auth_headers,
        )

        assert response.status_code == 503
        assert "call the provider" in response.json()["detail"].lower()

    def test_a_refused_submission_leaves_the_row_unsent(self, client, auth_headers):
        appointment_id = self._create(client, auth_headers)

        client.post(
            f"/appointments/{appointment_id}/submit",
            json=SYNTHETIC_IDENTITY,
            headers=auth_headers,
        )

        after = client.get(
            f"/appointments/{appointment_id}", headers=auth_headers
        ).json()
        assert after["delivery_state"] == "NOT_SENT"
        assert after["provider_notified"] is False

    def test_the_response_body_never_contains_identity(self, client, auth_headers):
        appointment_id = self._create(client, auth_headers)

        response = client.post(
            f"/appointments/{appointment_id}/submit",
            json=SYNTHETIC_IDENTITY,
            headers=auth_headers,
        )

        body = response.text
        assert "Testperson" not in body
        assert "1985-04-12" not in body
        assert "Synthetic Plaza" not in body

    def test_a_rejected_identity_is_not_echoed_back(self, client, auth_headers):
        """
        The validation-error handler in `app/main.py` strips the submitted
        value. That matters more here than anywhere else in the app: without
        it, a mistyped date of birth comes back in the 422 body.
        """
        appointment_id = self._create(client, auth_headers)

        response = client.post(
            f"/appointments/{appointment_id}/submit",
            json={**SYNTHETIC_IDENTITY, "phone": "nonsense"},
            headers=auth_headers,
        )

        assert response.status_code == 422
        assert "nonsense" not in response.text
        assert "Testperson" not in response.text

    def test_one_user_cannot_submit_another_users_appointment(
        self, client, auth_headers, other_user_headers
    ):
        appointment_id = self._create(client, auth_headers)

        response = client.post(
            f"/appointments/{appointment_id}/submit",
            json=SYNTHETIC_IDENTITY,
            headers=other_user_headers,
        )

        assert response.status_code == 404

    def test_submitting_requires_authentication(self, client, auth_headers):
        appointment_id = self._create(client, auth_headers)

        response = client.post(
            f"/appointments/{appointment_id}/submit", json=SYNTHETIC_IDENTITY
        )

        assert response.status_code == 401


class TestCapabilities:
    def test_reports_that_online_booking_is_off(self, client, auth_headers):
        response = client.get("/appointments/capabilities", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {"online_booking": False}

    def test_capabilities_is_not_read_as_an_appointment_id(self, client, auth_headers):
        """
        Route-ordering guard. Declared after `/{appointment_id}` this returns
        404 - "capabilities" looked up as an id - and the app would silently
        conclude booking is unavailable for the wrong reason.
        """
        response = client.get("/appointments/capabilities", headers=auth_headers)

        assert response.status_code != 404
