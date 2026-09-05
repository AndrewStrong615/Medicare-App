"""
Tests for the appointments API.

Synthetic data only: invented providers, invented NPIs, invented complaints.

The scoping tests mirror `test_medications_api.py` - appointments are health
data and carry the same one-user-one-row rule. The delivery tests are specific
to this feature and guard the claim the UI is allowed to make: MedHelp has not
contacted anybody.
"""

SYNTHETIC_APPOINTMENT = {
    "provider_name": "Synthetic Urgent Care LLC",
    "provider_npi": "1000000001",
    "provider_specialty": "Clinic/Center, Urgent Care",
    "provider_phone": "(212) 555-0143",
    "provider_address": "1 Synthetic Plaza, New York, NY, 10001",
    "reason_for_visit": "Sore throat and a fever since Tuesday.",
    "preferred_time": "Thursday morning",
}


def _create(client, headers, **overrides):
    payload = {**SYNTHETIC_APPOINTMENT, **overrides}
    return client.post("/appointments", json=payload, headers=headers)


def test_create_then_list_round_trips(client, auth_headers):
    created = _create(client, auth_headers)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["provider_name"] == "Synthetic Urgent Care LLC"
    assert body["reason_for_visit"] == "Sore throat and a fever since Tuesday."

    listed = client.get("/appointments", headers=auth_headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [body["id"]]


def test_a_new_appointment_has_not_been_sent_to_anyone(client, auth_headers):
    """
    The single most important property of this feature.

    MedHelp has no BAA-covered channel to a provider, so creating a record
    contacts nobody. If this ever passes while `provider_notified` is True,
    a screen somewhere is entitled to tell the user their provider knows -
    and no provider would.
    """
    body = _create(client, auth_headers).json()
    assert body["status"] == "REQUESTED"
    assert body["delivery_state"] == "NOT_SENT"
    assert body["provider_notified"] is False


def test_a_client_cannot_claim_its_request_was_delivered(client, auth_headers):
    """
    A caller posting `status`/`delivery_state` must not be believed. These are
    server-set; otherwise a client bug (or a curl) could mark a row as sent.
    """
    body = _create(
        client,
        auth_headers,
        status="SCHEDULED",
        delivery_state="SENT",
    ).json()
    assert body["status"] == "REQUESTED"
    assert body["delivery_state"] == "NOT_SENT"
    assert body["provider_notified"] is False


def test_marking_an_appointment_scheduled_still_reports_nothing_was_sent(
    client, auth_headers
):
    """
    The user rings the clinic and books it themselves, then records that here.
    That is a real appointment - but MedHelp still transmitted nothing, and
    `provider_notified` must not drift into meaning "the user has a booking".
    """
    created = _create(client, auth_headers).json()
    updated = client.put(
        f"/appointments/{created['id']}",
        json={"status": "SCHEDULED", "preferred_time": "Thu 9:30am", "notes": None},
        headers=auth_headers,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["status"] == "SCHEDULED"
    assert body["provider_notified"] is False
    assert body["delivery_state"] == "NOT_SENT"


def test_urgency_context_carries_over_from_intake(client, auth_headers):
    body = _create(
        client,
        auth_headers,
        urgency_tier="urgent",
        source_assessment_id="synthetic-assessment-id",
    ).json()
    assert body["urgency_tier"] == "URGENT"
    assert body["source_assessment_id"] == "synthetic-assessment-id"


def test_an_unknown_urgency_tier_is_rejected(client, auth_headers):
    response = _create(client, auth_headers, urgency_tier="PROBABLY_FINE")
    assert response.status_code == 422


def test_a_blank_provider_name_is_rejected(client, auth_headers):
    response = _create(client, auth_headers, provider_name="   ")
    assert response.status_code == 422


def test_one_user_cannot_read_another_users_appointment(
    client, auth_headers, other_user_headers
):
    created = _create(client, auth_headers).json()

    fetched = client.get(f"/appointments/{created['id']}", headers=other_user_headers)
    assert fetched.status_code == 404

    listed = client.get("/appointments", headers=other_user_headers)
    assert listed.json() == []


def test_one_user_cannot_modify_or_delete_another_users_appointment(
    client, auth_headers, other_user_headers
):
    created = _create(client, auth_headers).json()

    updated = client.put(
        f"/appointments/{created['id']}",
        json={"status": "CANCELLED", "preferred_time": None, "notes": None},
        headers=other_user_headers,
    )
    assert updated.status_code == 404

    deleted = client.delete(
        f"/appointments/{created['id']}", headers=other_user_headers
    )
    assert deleted.status_code == 404

    # Still there, untouched, for its owner.
    still = client.get(f"/appointments/{created['id']}", headers=auth_headers)
    assert still.status_code == 200
    assert still.json()["status"] == "REQUESTED"


def test_appointments_require_authentication(client):
    assert client.get("/appointments").status_code == 401
    assert client.post("/appointments", json=SYNTHETIC_APPOINTMENT).status_code == 401


def test_delete_removes_the_appointment(client, auth_headers):
    created = _create(client, auth_headers).json()
    assert (
        client.delete(f"/appointments/{created['id']}", headers=auth_headers).status_code
        == 204
    )
    assert client.get("/appointments", headers=auth_headers).json() == []
