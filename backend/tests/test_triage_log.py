"""
Tests for the development-only classification log.

This module exists to make classifier quality reviewable, and it does that by
writing the one thing this app is otherwise careful never to log: the user's
own description of their symptoms. So the tests that matter most here are not
about the happy path — they are about the log staying shut.

CLAUDE.md: "Do not log request/response bodies that contain user health data."
The escape hatch below is narrow on purpose, and these tests are what keep it
narrow. Every description used here is synthetic.
"""

import logging

import pytest

from app.core import triage_log


@pytest.fixture()
def dev_logging_on(monkeypatch):
    """A developer machine with the flag deliberately switched on."""
    monkeypatch.setattr(triage_log.settings, "environment", "local")
    monkeypatch.setattr(triage_log.settings, "triage_log_classifications", True)


def _record(**overrides):
    """One classification, with synthetic defaults."""
    entry = {
        "description": "sore throat and a cough since yesterday",
        "followup_answers": None,
        "tier": "SELF_CARE",
        "rule_tier": "SELF_CARE",
        "model_tier": "SELF_CARE",
        "confidence": "HIGH",
        "rules_defaulted": False,
        "red_flag_match": False,
        "escalated_by_safety_net": False,
        "model_requested_followup": False,
        "exhausted_followup": False,
        "asked_followup": False,
    }
    entry.update(overrides)
    triage_log.record(**entry)


class TestItIsOffUnlessSomeoneTurnsItOn:
    def test_the_default_is_off(self, monkeypatch):
        monkeypatch.setattr(triage_log.settings, "environment", "local")
        monkeypatch.setattr(triage_log.settings, "triage_log_classifications", False)

        assert triage_log.logging_enabled() is False

    def test_the_flag_switches_it_on_outside_production(self, dev_logging_on):
        assert triage_log.logging_enabled() is True

    def test_nothing_is_written_while_it_is_off(self, monkeypatch, caplog):
        monkeypatch.setattr(triage_log.settings, "environment", "local")
        monkeypatch.setattr(triage_log.settings, "triage_log_classifications", False)

        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(description="synthetic description that must not be logged")

        assert caplog.records == []


class TestProductionIsRefusedWhateverTheFlagSays:
    """
    The most important tests in this file.

    A flag flipped in the wrong environment is exactly how health data ends up
    in an application log, so production is not something the operator can
    talk this module into.
    """

    def test_production_refuses_even_with_the_flag_on(self, monkeypatch):
        monkeypatch.setattr(triage_log.settings, "environment", "production")
        monkeypatch.setattr(triage_log.settings, "triage_log_classifications", True)

        assert triage_log.logging_enabled() is False

    def test_no_description_reaches_the_log_in_production(self, monkeypatch, caplog):
        monkeypatch.setattr(triage_log.settings, "environment", "production")
        monkeypatch.setattr(triage_log.settings, "triage_log_classifications", True)

        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(description="synthetic-but-treat-as-sensitive description")

        assert caplog.records == []
        assert "synthetic-but-treat-as-sensitive" not in caplog.text


class TestWhatGetsRecordedWhenItIsOn:
    def test_a_classification_is_written(self, dev_logging_on, caplog):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record()

        assert len(caplog.records) == 1

    def test_every_line_is_marked_synthetic_only(self, dev_logging_on, caplog):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record()

        # Anyone reading these lines later should be able to tell at a glance
        # that they were never supposed to contain real descriptions.
        assert triage_log.SYNTHETIC_ONLY_BANNER in caplog.text

    def test_the_reviewable_fields_are_all_present(self, dev_logging_on, caplog):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(
                tier="URGENT",
                rule_tier="URGENT",
                model_tier=None,
                confidence="LOW",
                rules_defaulted=True,
            )

        text = caplog.text
        # The point of the log: tier, what each layer said, and how confident
        # the model was — enough to measure the two layers separately.
        assert '"tier": "URGENT"' in text
        assert '"rule_tier": "URGENT"' in text
        assert '"confidence": "LOW"' in text
        assert '"rules_defaulted": true' in text

    def test_the_follow_up_answers_are_recorded(self, dev_logging_on, caplog):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(
                followup_answers={"location": "lower back", "severity": "6"},
                asked_followup=True,
            )

        assert "lower back" in caplog.text
        assert '"asked_followup": true' in caplog.text

    def test_the_question_text_is_not_repeated_into_every_line(
        self, dev_logging_on, caplog
    ):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(followup_answers={"location": "lower back"}, asked_followup=True)

        # The prompts are fixed and readable in app.core.followup. Copying
        # them into every record would bloat the log without adding anything.
        assert "Where in your body" not in caplog.text

    def test_a_long_description_is_truncated(self, dev_logging_on, caplog):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(description="ache " * 400)

        # A log line is a summary for tuning, not a transcript.
        assert "…" in caplog.text
        assert len(caplog.text) < 4 * triage_log.MAX_LOGGED_DESCRIPTION

    def test_whitespace_is_collapsed_so_one_classification_is_one_line(
        self, dev_logging_on, caplog
    ):
        with caplog.at_level(logging.INFO, logger="app.triage.classifications"):
            _record(description="sore throat\nand a cough\n\nsince yesterday")

        assert len(caplog.records) == 1
        assert "sore throat and a cough since yesterday" in caplog.text


class TestLoggingNeverCostsTheUserAnAssessment:
    def test_an_unserialisable_value_does_not_raise(self, dev_logging_on):
        class Unserialisable:
            pass

        # json.dumps cannot encode this. The assessment has already been made
        # by the time this runs, and losing it over a log line would be a far
        # worse outcome than losing the line.
        _record(followup_answers={"location": Unserialisable()})

    def test_a_broken_logger_does_not_raise(self, dev_logging_on, monkeypatch):
        def _explode(*args, **kwargs):
            raise RuntimeError("log sink is down")

        monkeypatch.setattr(triage_log.logger, "info", _explode)

        _record()
