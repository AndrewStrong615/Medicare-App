"""
Confirm the triage model layer is actually reachable.

Run after putting ANTHROPIC_API_KEY in backend/.env:

    cd backend && python scripts/check_triage_credentials.py

Answers the one question the app cannot answer for you from the outside: is
the model being consulted, or is it being skipped silently? A missing key is
not an error in this app — the rule layer carries the feature on its own — so
without a check like this a misconfigured key looks exactly like a working one.

Sends one synthetic description. No real health data.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Run as a script from backend/, so `app` is not importable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import triage  # noqa: E402

# Deliberately vague: the rule layer has nothing to match, so it defaults to
# URGENT with canned text. Any description-specific reasoning in the output
# therefore came from the model, which is exactly what is being tested.
PROBE = "I have been feeling off since this morning and my stomach is unsettled."


def main() -> int:
    if not triage.credentials_available():
        print("NOT CONFIGURED — no credentials found.")
        print("  Put ANTHROPIC_API_KEY=sk-ant-... in backend/.env, then restart the server.")
        print("  The app still works without it: intake falls back to the rule layer.")
        return 1

    print(f"Credentials found. Sending one synthetic description to {triage.TRIAGE_MODEL}...\n")

    try:
        tier, reasoning, model_id = triage._classify_with_model(PROBE)
    except triage.TriageUnavailable as exc:
        print(f"REACHED THE CODE PATH BUT THE CALL FAILED: {exc}")
        print("  The key may be invalid, out of credit, or the API may be down.")
        print("  Intake will keep working on the rule layer alone.")
        return 1

    print(f"  model      {model_id}")
    print(f"  tier       {tier.name}")
    print(f"  reasoning  {reasoning}\n")

    result = triage.assess(PROBE)
    print(f"Full assessment: final={result.tier.name} "
          f"rules={result.rule_tier.name} model={result.model_tier.name if result.model_tier else None}")
    print("\nWorking. The reasoning above is written to the description; without a key")
    print("it would have been the rule layer's canned paragraph.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
