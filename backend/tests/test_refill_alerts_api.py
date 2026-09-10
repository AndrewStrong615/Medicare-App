"""
Tests for the refill estimate as it reaches a client (`/medications`).

`test_refill_forecast.py` covers the arithmetic. What is tested here is the
wiring, and specifically the three joins that would be easy to get wrong:

* the estimate is **derived from confirmed reminder times** when the user did
  not type a doses-per-day figure, so a fallback that silently stopped working
  would be invisible;
* the lead time is the **caller's**, not a constant, because it is a user
  setting that lives on their device rather than in a table here;
* the estimate is **scoped to the caller** like everything else on this route,
  and one user's reminders never feed another user's forecast.

All medication names and quantities below are invented.
"""

from datetime import date, timedelta

SYNTHETIC_MEDICATION = {
    "name": "Placebofen",
    "dosage": "10 mg",
    "frequency": "twice daily",
    "notes": "Synthetic test record.",
}


def _create(client, headers, **overrides):
    payload = {**SYNTHETIC_MEDICATION, **overrides}
    response = client.post("/medications", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _list(client, headers, **params):
    response = client.get("/medications", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _only(client, headers, **params):
    body = _list(client, headers, **params)
    assert len(body) == 1
    return body[0]


class TestTheEstimateReachesTheClient:
    def test_a_medication_with_a_count_and_a_dose_gets_a_run_out_date(
        self, client, auth_headers
    ):
        _create(
            client,
            auth_headers,
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
            doses_per_day=2,
        )

        estimate = _only(client, auth_headers)["refill_estimate"]

        assert estimate["run_out_on"] == (date.today() + timedelta(days=15)).isoformat()
        assert estimate["days_remaining"] == 15
        assert estimate["doses_per_day_source"] == "entered"

    def test_every_estimate_is_flagged_as_one(self, client, auth_headers):
        # MedHelp cannot know whether a dose was taken, so nothing it returns
        # here may present as a measurement.
        _create(
            client,
            auth_headers,
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
            doses_per_day=2,
        )

        assert _only(client, auth_headers)["refill_estimate"]["is_estimate"] is True

    def test_a_medication_with_no_supply_data_gets_a_reason_not_a_date(
        self, client, auth_headers
    ):
        _create(client, auth_headers)

        estimate = _only(client, auth_headers)["refill_estimate"]

        assert estimate["run_out_on"] is None
        assert estimate["is_estimate"] is False
        assert estimate["alert"] is False
        assert estimate["reason"]

    def test_the_count_date_is_filled_in_when_a_quantity_arrives_without_one(
        self, client, auth_headers
    ):
        # A count with no date could never go stale, and the projection would
        # keep reporting the same answer forever.
        body = _create(client, auth_headers, quantity_remaining=30, doses_per_day=1)

        assert body["quantity_counted_on"] == date.today().isoformat()


class TestDosesPerDayFallsBackToConfirmedReminders:
    def test_saved_reminder_times_stand_in_for_a_dose_count(
        self, client, auth_headers
    ):
        # Those times exist only because the user reviewed a draft and pressed
        # save, so counting them adds no guess of MedHelp's own.
        medication = _create(
            client,
            auth_headers,
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
        )
        response = client.put(
            f"/reminders/medications/{medication['id']}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text

        estimate = _only(client, auth_headers)["refill_estimate"]

        assert estimate["doses_per_day"] == 2
        assert estimate["doses_per_day_source"] == "reminders"
        assert estimate["days_remaining"] == 15

    def test_a_typed_figure_beats_the_reminder_count(self, client, auth_headers):
        medication = _create(
            client,
            auth_headers,
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
            doses_per_day=3,
        )
        client.put(
            f"/reminders/medications/{medication['id']}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        )

        estimate = _only(client, auth_headers)["refill_estimate"]

        assert estimate["doses_per_day"] == 3
        assert estimate["doses_per_day_source"] == "entered"

    def test_no_reminders_and_no_figure_means_no_estimate(self, client, auth_headers):
        _create(
            client,
            auth_headers,
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
        )

        estimate = _only(client, auth_headers)["refill_estimate"]

        assert estimate["run_out_on"] is None
        assert "how many times a day" in estimate["reason"]


class TestTheLeadTimeIsTheCallers:
    def test_defaults_to_three_days(self, client, auth_headers):
        _create(
            client,
            auth_headers,
            quantity_remaining=4,
            quantity_counted_on=date.today().isoformat(),
            doses_per_day=1,
        )

        estimate = _only(client, auth_headers)["refill_estimate"]

        assert estimate["lead_days"] == 3
        assert estimate["alert"] is False

    def test_a_longer_lead_time_flags_the_same_medication(self, client, auth_headers):
        _create(
            client,
            auth_headers,
            quantity_remaining=4,
            quantity_counted_on=date.today().isoformat(),
            doses_per_day=1,
        )

        estimate = _only(client, auth_headers, refill_lead_days=7)["refill_estimate"]

        assert estimate["lead_days"] == 7
        assert estimate["alert"] is True

    def test_an_out_of_range_lead_time_is_rejected_not_reinterpreted(
        self, client, auth_headers
    ):
        assert (
            client.get(
                "/medications", headers=auth_headers, params={"refill_lead_days": 0}
            ).status_code
            == 422
        )
        assert (
            client.get(
                "/medications", headers=auth_headers, params={"refill_lead_days": 999}
            ).status_code
            == 422
        )


class TestScoping:
    def test_one_users_reminders_never_feed_anothers_estimate(
        self, client, auth_headers, other_user_headers
    ):
        mine = _create(
            client,
            auth_headers,
            name="Mine",
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
        )
        client.put(
            f"/reminders/medications/{mine['id']}",
            json={"times": ["08:00", "20:00"]},
            headers=auth_headers,
        )
        _create(
            client,
            other_user_headers,
            name="Theirs",
            quantity_remaining=30,
            quantity_counted_on=date.today().isoformat(),
        )

        theirs = _only(client, other_user_headers)["refill_estimate"]

        assert theirs["doses_per_day"] is None
        assert theirs["run_out_on"] is None


class TestValidation:
    def test_a_negative_quantity_is_refused(self, client, auth_headers):
        response = client.post(
            "/medications",
            json={**SYNTHETIC_MEDICATION, "quantity_remaining": -1},
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_zero_doses_a_day_is_refused_rather_than_divided_by(
        self, client, auth_headers
    ):
        response = client.post(
            "/medications",
            json={**SYNTHETIC_MEDICATION, "doses_per_day": 0},
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_a_rejected_value_is_not_echoed_back(self, client, auth_headers):
        # Same rule as everywhere else on this API: a 422 does not repeat what
        # was submitted. See the handler in `app/main.py`.
        response = client.post(
            "/medications",
            json={**SYNTHETIC_MEDICATION, "quantity_remaining": -1},
            headers=auth_headers,
        )

        assert "input" not in response.text
