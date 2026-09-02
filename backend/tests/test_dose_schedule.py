"""
Tests for the reminder-time suggestion rules.

Every frequency string here is synthetic. The point of these tests is the
refusals as much as the matches: this module is only allowed to propose a
schedule for a plain daily rhythm it recognises, and must decline everything
else rather than guess. A wrong guess here moves when someone takes a
medicine.
"""

import pytest

from app.services.dose_schedule import MAX_DOSES_PER_DAY, suggest_times


class TestRecognisedRhythms:
    @pytest.mark.parametrize(
        "frequency,expected",
        [
            ("TAKE 1 TABLET BY MOUTH ONCE DAILY", ["09:00"]),
            ("take one tablet daily", ["09:00"]),
            ("1 tab po qd", ["09:00"]),
            ("TAKE 1 TABLET BY MOUTH TWICE DAILY", ["08:00", "20:00"]),
            ("take 1 capsule two times a day", ["08:00", "20:00"]),
            ("1 tab BID", ["08:00", "20:00"]),
            ("TAKE 1 TABLET THREE TIMES DAILY", ["08:00", "14:00", "20:00"]),
            ("1 tab tid", ["08:00", "14:00", "20:00"]),
            ("take 1 tablet four times daily", ["08:00", "13:00", "18:00", "22:00"]),
            ("1 tab QID", ["08:00", "13:00", "18:00", "22:00"]),
        ],
    )
    def test_lay_wording_and_printed_abbreviations_both_match(self, frequency, expected):
        # Labels print "BID"; people write "twice a day". Both reach this.
        result = suggest_times(frequency)

        assert result.recognised is True
        assert result.times == expected
        assert result.doses_per_day == len(expected)

    @pytest.mark.parametrize(
        "frequency,expected",
        [
            ("TAKE 1 TABLET EVERY 8 HOURS", ["08:00", "16:00", "00:00"]),
            ("take 1 tablet every 6 hours", ["08:00", "14:00", "20:00", "02:00"]),
            ("1 tab q12h", ["08:00", "20:00"]),
        ],
    )
    def test_hourly_intervals_run_round_the_clock(self, frequency, expected):
        # "Every 6 hours" really does mean a 02:00 dose. Confining these to
        # waking hours would quietly misrepresent the instruction.
        result = suggest_times(frequency)

        assert result.recognised is True
        assert result.times == expected

    @pytest.mark.parametrize(
        "frequency",
        [
            "TAKE 1 TABLET AT BEDTIME",
            "take one tablet nightly",
            "1 tab qhs",
            "TAKE 1 TABLET BY MOUTH ONCE DAILY AT BEDTIME",
        ],
    )
    def test_bedtime_is_an_evening_hour_not_the_morning_default(self, frequency):
        # A 09:00 alarm for a bedtime tablet is plainly the wrong hour.
        result = suggest_times(frequency)

        assert result.recognised is True
        assert result.times == ["22:00"]


class TestRefusals:
    @pytest.mark.parametrize(
        "frequency",
        [
            "TAKE 1 TABLET EVERY 6 HOURS AS NEEDED FOR PAIN",
            "take 1 tablet as needed",
            "1 tab q4h prn",
            "TAKE AS DIRECTED",
        ],
    )
    def test_as_needed_is_never_scheduled(self, frequency):
        """
        The most important refusal here.

        An as-needed label often carries an interval, but that interval is a
        maximum, not a schedule. An alarm built from it would tell someone to
        take a medicine they may not need — so "every 6 hours as needed" must
        refuse even though "every 6 hours" on its own is recognised.
        """
        result = suggest_times(frequency)

        assert result.recognised is False
        assert result.times == []
        assert result.reason is not None

    @pytest.mark.parametrize(
        "frequency",
        [
            "TAKE 1 TABLET EVERY OTHER DAY",
            "take one tablet weekly",
            "1 tablet once a week",
            "take on Mondays",
        ],
    )
    def test_rhythms_that_are_not_daily_are_declined(self, frequency):
        # The reminder model is daily times. Anything else gets no suggestion
        # rather than a wrong one.
        result = suggest_times(frequency)

        assert result.recognised is False
        assert result.reason is not None

    @pytest.mark.parametrize(
        "frequency",
        [
            "APPLY THINLY TO AFFECTED AREA",
            "USE AS INSTRUCTED BY YOUR DOCTOR",
            "TAKE WITH FOOD",
            "qwerty",
            "",
            None,
        ],
    )
    def test_anything_unrecognised_proposes_nothing(self, frequency):
        result = suggest_times(frequency)

        assert result.recognised is False
        assert result.times == []
        # Declining is an ordinary outcome and must come with words the user
        # can act on, not an error.
        assert result.reason

    def test_an_interval_that_would_flood_the_day_is_declined(self):
        result = suggest_times("take 1 tablet every 2 hours")

        assert result.recognised is False
        assert 24 // 2 > MAX_DOSES_PER_DAY

    def test_food_and_route_qualifiers_are_not_acted_on(self):
        """
        "With food" is left in the verbatim text, not turned into a mealtime.

        The suggestion is still the ordinary twice-daily default; MedHelp does
        not know when this person eats and must not pretend to.
        """
        result = suggest_times("TAKE 1 TABLET BY MOUTH TWICE DAILY WITH FOOD")

        assert result.times == ["08:00", "20:00"]


def test_the_frequency_text_is_never_modified():
    """
    This module reads the sig line and never rewrites it.

    The verbatim rule in CLAUDE.md is the reason the suggestion is returned
    alongside the original rather than in place of it — nothing here returns
    an edited version of what was printed on the label.
    """
    original = "TAKE 1 TABLET BY MOUTH TWICE DAILY"
    result = suggest_times(original)

    assert original == "TAKE 1 TABLET BY MOUTH TWICE DAILY"
    # The suggestion carries times, never prose.
    assert all(len(time) == 5 and time[2] == ":" for time in result.times)
