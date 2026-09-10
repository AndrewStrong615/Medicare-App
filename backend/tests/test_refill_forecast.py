"""
Tests for the run-out estimate (`services/refill_forecast.py`).

The properties worth protecting, in order of what they would cost:

1. **The `frequency` text is never read.** Decoding printed directions into a
   dose count is the thing the verbatim rule forbids, and the forecast module
   does not take that argument at all — asserted here against its signature so
   that adding one is a test failure rather than a quiet change of policy.
2. **Declining is a normal outcome.** Missing inputs produce no date and a
   reason, never a guess. A confident wrong run-out date is worse than none
   for someone deciding whether to chase a prescription.
3. **Nothing rounds up.** Half a day's supply does not get anyone through a
   day.

All values below are invented.
"""

import ast
import inspect
from datetime import date

import pytest

from app.services import refill_forecast
from app.services.refill_forecast import (
    MAX_PROJECTION_DAYS,
    REFILL_LEAD_DAYS_DEFAULT,
    REFILL_LEAD_DAYS_MAX,
    REFILL_LEAD_DAYS_MIN,
    clamp_lead_days,
    forecast,
    resolve_doses_per_day,
)

TODAY = date(2026, 9, 3)


class TestItNeverReadsTheDirections:
    def test_forecast_takes_no_frequency_argument(self):
        """
        The guard on the rule this module exists under.

        `dose_schedule.suggest_times` may propose a schedule for a user to
        confirm. This module must never do the same thing silently, and the
        cheapest way to hold that line is for the text not to be reachable
        from here at all.
        """
        parameters = inspect.signature(forecast).parameters

        assert "frequency" not in parameters
        assert "directions" not in parameters
        assert "sig" not in parameters

    def test_the_module_does_not_import_the_schedule_parser(self):
        """
        Checked against the import statements, not the file text — the module
        note discusses `dose_schedule` at length, and it should be able to
        without failing its own test.
        """
        tree = ast.parse(inspect.getsource(refill_forecast))
        imported = {
            name
            for node in ast.walk(tree)
            if isinstance(node, (ast.Import, ast.ImportFrom))
            for name in ([node.module or ""] if isinstance(node, ast.ImportFrom) else [])
            + [alias.name for alias in node.names]
        }

        assert not any("dose_schedule" in name for name in imported)


class TestResolvingDosesPerDay:
    def test_a_number_the_user_typed_wins(self):
        assert resolve_doses_per_day(3, 2) == (3, "entered")

    def test_confirmed_reminder_times_are_used_when_nothing_was_typed(self):
        # Those times exist only because someone reviewed a draft and pressed
        # save, so counting them adds no guess of our own.
        assert resolve_doses_per_day(None, 2) == (2, "reminders")

    def test_no_confirmation_anywhere_means_no_figure(self):
        assert resolve_doses_per_day(None, 0) == (None, None)

    def test_a_nonsensical_entry_falls_back_rather_than_dividing_by_it(self):
        assert resolve_doses_per_day(0, 2) == (2, "reminders")


class TestEstimating:
    def test_projects_from_the_day_the_count_was_true(self):
        # 30 tablets, twice a day, counted on the 3rd: 15 days of supply.
        result = forecast(
            quantity_remaining=30,
            quantity_counted_on=TODAY,
            doses_per_day=2,
            today=TODAY,
            lead_days=3,
        )

        assert result.run_out_on == date(2026, 9, 18)
        assert result.days_remaining == 15
        assert result.alert is False

    def test_an_older_count_has_already_been_running_down(self):
        # The count is what it was on the 1st, not what it is today.
        result = forecast(
            quantity_remaining=10,
            quantity_counted_on=date(2026, 9, 1),
            doses_per_day=2,
            today=TODAY,
            lead_days=3,
        )

        assert result.run_out_on == date(2026, 9, 6)
        assert result.days_remaining == 3

    def test_a_part_day_of_supply_is_dropped_not_rounded_up(self):
        # 7 tablets at 2 a day is three whole days, not four.
        result = forecast(
            quantity_remaining=7,
            quantity_counted_on=TODAY,
            doses_per_day=2,
            today=TODAY,
        )

        assert result.days_remaining == 3

    def test_every_answer_is_marked_an_estimate(self):
        # MedHelp does not know whether a dose was taken. Nothing that comes
        # out of here may present as a measurement.
        result = forecast(
            quantity_remaining=30,
            quantity_counted_on=TODAY,
            doses_per_day=2,
            today=TODAY,
        )

        assert result.is_estimate is True

    def test_falls_back_to_the_confirmed_reminder_times(self):
        result = forecast(
            quantity_remaining=30,
            quantity_counted_on=TODAY,
            doses_per_day=None,
            enabled_reminder_count=3,
            today=TODAY,
        )

        assert result.doses_per_day == 3
        assert result.doses_per_day_source == "reminders"
        assert result.days_remaining == 10


class TestAlerting:
    @pytest.mark.parametrize("days_of_supply", [0, 1, 2, 3])
    def test_alerts_inside_the_lead_time(self, days_of_supply):
        result = forecast(
            quantity_remaining=days_of_supply,
            quantity_counted_on=TODAY,
            doses_per_day=1,
            today=TODAY,
            lead_days=3,
        )

        assert result.alert is True

    def test_does_not_alert_outside_the_lead_time(self):
        result = forecast(
            quantity_remaining=4,
            quantity_counted_on=TODAY,
            doses_per_day=1,
            today=TODAY,
            lead_days=3,
        )

        assert result.alert is False

    def test_still_alerts_once_the_estimate_has_passed(self):
        # Running out three days ago is not a reason to stop saying so.
        result = forecast(
            quantity_remaining=2,
            quantity_counted_on=date(2026, 8, 25),
            doses_per_day=1,
            today=TODAY,
            lead_days=3,
        )

        assert result.days_remaining < 0
        assert result.alert is True

    def test_a_longer_lead_time_alerts_earlier(self):
        arguments = dict(
            quantity_remaining=10,
            quantity_counted_on=TODAY,
            doses_per_day=1,
            today=TODAY,
        )

        assert forecast(**arguments, lead_days=3).alert is False
        assert forecast(**arguments, lead_days=14).alert is True


class TestDeclining:
    def test_no_quantity_means_no_estimate_and_a_reason(self):
        result = forecast(
            quantity_remaining=None,
            quantity_counted_on=None,
            doses_per_day=2,
            today=TODAY,
        )

        assert result.run_out_on is None
        assert result.alert is False
        assert result.is_estimate is False
        assert "how many you have left" in result.reason

    def test_no_confirmed_doses_per_day_means_no_estimate(self):
        result = forecast(
            quantity_remaining=30,
            quantity_counted_on=TODAY,
            doses_per_day=None,
            enabled_reminder_count=0,
            today=TODAY,
        )

        assert result.run_out_on is None
        assert "how many times a day" in result.reason

    def test_a_count_dated_in_the_future_is_refused(self):
        # It would project further out than the supply justifies, which errs
        # in the unsafe direction.
        result = forecast(
            quantity_remaining=30,
            quantity_counted_on=date(2026, 12, 1),
            doses_per_day=2,
            today=TODAY,
        )

        assert result.run_out_on is None
        assert "in the future" in result.reason

    def test_an_absurd_supply_is_refused_rather_than_projected(self):
        result = forecast(
            quantity_remaining=MAX_PROJECTION_DAYS + 50,
            quantity_counted_on=TODAY,
            doses_per_day=1,
            today=TODAY,
        )

        assert result.run_out_on is None
        assert "more than a year" in result.reason

    def test_a_negative_supply_never_becomes_a_date_in_the_past(self):
        result = forecast(
            quantity_remaining=-5,
            quantity_counted_on=TODAY,
            doses_per_day=1,
            today=TODAY,
        )

        assert result.run_out_on is None

    def test_declining_still_reports_what_it_did_know(self):
        # So the UI can say which half is missing rather than "no estimate".
        result = forecast(
            quantity_remaining=None,
            quantity_counted_on=None,
            doses_per_day=None,
            enabled_reminder_count=2,
            today=TODAY,
        )

        assert result.doses_per_day == 2
        assert result.doses_per_day_source == "reminders"


class TestLeadTime:
    def test_defaults_when_nothing_is_chosen(self):
        assert clamp_lead_days(None) == REFILL_LEAD_DAYS_DEFAULT

    def test_clamps_to_a_range_an_alert_can_live_in(self):
        assert clamp_lead_days(0) == REFILL_LEAD_DAYS_MIN
        assert clamp_lead_days(9999) == REFILL_LEAD_DAYS_MAX
        assert clamp_lead_days(5) == 5
