"""
Tests for the medication list.

All medication names, dosages and doctors below are invented. The
cross-account tests matter most: medication data is health data, and one
signed-in user must never be able to read or change another's.
"""

from datetime import date, timedelta

import pytest

SYNTHETIC_MEDICATION = {
    "name": "Placebofen",
    "dosage": "10 mg",
    "frequency": "twice daily",
    "prescribing_doctor": "Dr. Imaginary",
    "notes": "Synthetic test record.",
}


def _create(client, headers, **overrides):
    payload = {**SYNTHETIC_MEDICATION, **overrides}
    return client.post("/medications", json=payload, headers=headers)


class TestAuthentication:
    def test_listing_requires_a_token(self, client):
        assert client.get("/medications").status_code == 401

    def test_creating_requires_a_token(self, client):
        assert client.post("/medications", json=SYNTHETIC_MEDICATION).status_code == 401

    def test_a_garbage_token_is_rejected(self, client):
        response = client.get(
            "/medications", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert response.status_code == 401


class TestCrud:
    def test_create_returns_the_stored_medication(self, client, auth_headers):
        response = _create(client, auth_headers)

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "Placebofen"
        assert body["dosage"] == "10 mg"
        assert body["prescribing_doctor"] == "Dr. Imaginary"
        assert body["id"]

    def test_list_returns_only_this_users_medications(
        self, client, auth_headers, other_user_headers
    ):
        _create(client, auth_headers, name="Mine")
        _create(client, other_user_headers, name="Theirs")

        body = client.get("/medications", headers=auth_headers).json()

        assert [m["name"] for m in body] == ["Mine"]

    def test_list_is_sorted_by_name(self, client, auth_headers):
        _create(client, auth_headers, name="Zetamol")
        _create(client, auth_headers, name="Alphacillin")

        body = client.get("/medications", headers=auth_headers).json()

        assert [m["name"] for m in body] == ["Alphacillin", "Zetamol"]

    def test_update_replaces_the_editable_fields(self, client, auth_headers):
        created = _create(client, auth_headers).json()

        response = client.put(
            f"/medications/{created['id']}",
            json={**SYNTHETIC_MEDICATION, "name": "Renamed", "dosage": "20 mg"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"
        assert response.json()["dosage"] == "20 mg"

    def test_delete_removes_it_from_the_list(self, client, auth_headers):
        created = _create(client, auth_headers).json()

        assert (
            client.delete(f"/medications/{created['id']}", headers=auth_headers).status_code
            == 204
        )
        assert client.get("/medications", headers=auth_headers).json() == []

    def test_optional_fields_may_be_omitted(self, client, auth_headers):
        response = client.post("/medications", json={"name": "Bare"}, headers=auth_headers)

        assert response.status_code == 201
        assert response.json()["dosage"] is None

    def test_blank_name_is_rejected(self, client, auth_headers):
        response = _create(client, auth_headers, name="   ")

        assert response.status_code == 422

    def test_whitespace_is_trimmed(self, client, auth_headers):
        body = _create(client, auth_headers, name="  Spacey  ", dosage="  5 mg  ").json()

        assert body["name"] == "Spacey"
        assert body["dosage"] == "5 mg"

    def test_empty_optional_strings_become_null(self, client, auth_headers):
        body = _create(client, auth_headers, dosage="   ").json()

        assert body["dosage"] is None


class TestCrossAccountIsolation:
    """One account must never reach another's medication records."""

    def test_cannot_read_another_users_medication(
        self, client, auth_headers, other_user_headers
    ):
        theirs = _create(client, other_user_headers).json()

        response = client.get(f"/medications/{theirs['id']}", headers=auth_headers)

        # 404 rather than 403: a 403 would confirm the record exists.
        assert response.status_code == 404

    def test_cannot_update_another_users_medication(
        self, client, auth_headers, other_user_headers
    ):
        theirs = _create(client, other_user_headers).json()

        response = client.put(
            f"/medications/{theirs['id']}",
            json={**SYNTHETIC_MEDICATION, "name": "Hijacked"},
            headers=auth_headers,
        )

        assert response.status_code == 404
        # And the original is untouched.
        still = client.get(f"/medications/{theirs['id']}", headers=other_user_headers)
        assert still.json()["name"] == "Placebofen"

    def test_cannot_delete_another_users_medication(
        self, client, auth_headers, other_user_headers
    ):
        theirs = _create(client, other_user_headers).json()

        response = client.delete(f"/medications/{theirs['id']}", headers=auth_headers)

        assert response.status_code == 404
        assert len(client.get("/medications", headers=other_user_headers).json()) == 1

    def test_unknown_id_is_also_a_404(self, client, auth_headers):
        response = client.get("/medications/does-not-exist", headers=auth_headers)

        assert response.status_code == 404


class TestRefillFlagging:
    def test_medication_with_no_refill_date_is_never_flagged(self, client, auth_headers):
        body = _create(client, auth_headers, refill_date=None).json()

        assert body["refill_due_soon"] is False
        assert body["refill_overdue"] is False
        assert body["days_until_refill"] is None

    def test_refill_far_in_the_future_is_not_flagged(self, client, auth_headers):
        future = (date.today() + timedelta(days=60)).isoformat()

        body = _create(client, auth_headers, refill_date=future).json()

        assert body["refill_due_soon"] is False
        assert body["days_until_refill"] == 60

    @pytest.mark.parametrize("days", [0, 1, 7])
    def test_refill_within_the_window_is_flagged_as_due_soon(
        self, client, auth_headers, days
    ):
        due = (date.today() + timedelta(days=days)).isoformat()

        body = _create(client, auth_headers, refill_date=due).json()

        assert body["refill_due_soon"] is True
        assert body["refill_overdue"] is False

    def test_the_day_after_the_window_is_not_flagged(self, client, auth_headers):
        due = (date.today() + timedelta(days=8)).isoformat()

        assert _create(client, auth_headers, refill_date=due).json()["refill_due_soon"] is False

    def test_past_refill_date_is_reported_as_overdue_not_due_soon(
        self, client, auth_headers
    ):
        past = (date.today() - timedelta(days=3)).isoformat()

        body = _create(client, auth_headers, refill_date=past).json()

        assert body["refill_overdue"] is True
        assert body["refill_due_soon"] is False
        assert body["days_until_refill"] == -3
