"""
Structured record of what the classifier did, for later review.

WHY: CLAUDE.md records that this classifier has no validated error profile —
nobody has measured its under-triage rate. That cannot change until there is
something to measure. This module writes the line a reviewer would need:
what was described, what was asked and answered, what tier came out, and how
confident the model was.

WHAT THIS IS NOT: it is not the audit trail. The durable record is the
`intake_assessments` table, written only with the user's consent. This is a
development aid — it goes to the application log, where it is useful while
tuning and worthless afterwards.

## The rule that governs this file

**Descriptions are health data and must never reach the application log in a
deployment that could hold real ones.** CLAUDE.md is explicit: "Do not log
request/response bodies that contain user health data." So:

* Logging is OFF unless `TRIAGE_LOG_CLASSIFICATIONS=true` is set explicitly.
* It refuses to turn on when `ENVIRONMENT=production`, whatever the flag says.
  A flag flipped in the wrong place is exactly how this kind of leak happens,
  so the environment check is not something the operator can override here.
* Even switched on, the description is truncated and the record carries a
  banner saying it must contain synthetic data only.

Turning this on in an environment holding real user descriptions would be a
reportable data-handling failure. It exists to tune the classifier against
made-up inputs.
"""

from __future__ import annotations

import json
import logging

from app.core.config import settings

logger = logging.getLogger("app.triage.classifications")

# Enough to see what was described without turning the log into a transcript.
MAX_LOGGED_DESCRIPTION = 300

SYNTHETIC_ONLY_BANNER = "SYNTHETIC-DEV-DATA-ONLY"


def logging_enabled() -> bool:
    """
    Whether classification logging may run at all.

    Production is refused unconditionally — the flag is not sufficient there.
    """
    if settings.environment == "production":
        return False
    return settings.triage_log_classifications


def _truncate(text: str) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= MAX_LOGGED_DESCRIPTION:
        return cleaned
    return cleaned[:MAX_LOGGED_DESCRIPTION] + "…"


def record(
    *,
    description: str,
    followup_answers: dict[str, str] | None,
    tier: str,
    rule_tier: str | None,
    model_tier: str | None,
    confidence: str | None,
    rules_defaulted: bool,
    red_flag_match: bool,
    escalated_by_safety_net: bool,
    model_requested_followup: bool,
    exhausted_followup: bool,
    asked_followup: bool,
) -> None:
    """
    Write one classification to the log, if logging is enabled.

    Silently does nothing when disabled, which is the normal state. Never
    raises: a logging problem must not cost the user their assessment.
    """
    if not logging_enabled():
        return

    try:
        entry = {
            "banner": SYNTHETIC_ONLY_BANNER,
            "description": _truncate(description),
            # The questions themselves are fixed and readable in
            # `app.core.followup`, so only the answers are recorded.
            "followup_answers": followup_answers or {},
            "asked_followup": asked_followup,
            "tier": tier,
            "rule_tier": rule_tier,
            "model_tier": model_tier,
            "confidence": confidence,
            "rules_defaulted": rules_defaulted,
            "red_flag_match": red_flag_match,
            "escalated_by_safety_net": escalated_by_safety_net,
            "model_requested_followup": model_requested_followup,
            "exhausted_followup": exhausted_followup,
        }
        logger.info("triage.classification %s", json.dumps(entry, ensure_ascii=False))
    except Exception:  # noqa: BLE001
        # A broken log line is not worth failing an assessment over.
        logger.warning("Could not write a classification log entry.")
