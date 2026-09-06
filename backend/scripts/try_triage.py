"""
Run a description through the triage layers and show exactly what happened.

    cd backend

    # 1. No setup at all. Runs the real client, the real loop and the real
    #    reconciliation against a built-in fake model that always answers
    #    SELF_CARE — so you can watch the safety net refuse to be talked down.
    python scripts/try_triage.py --stub

    # 2. Against whatever LLM_BASE_URL / LLM_MODEL you put in backend/.env
    #    (or ANTHROPIC_API_KEY, if you set that instead).
    python scripts/try_triage.py
    python scripts/try_triage.py "my ankle is swollen and I can't put weight on it"

Answers the question the app cannot answer from the outside: is the model
being consulted, or skipped silently? A missing model layer is not an error
here — the rule layer carries the feature alone — so a misconfigured endpoint
looks exactly like a working one from the UI.

SYNTHETIC DESCRIPTIONS ONLY. Anything you type here is a symptom description,
and with a hosted endpoint it is transmitted to that vendor. Do not type
anything real about a real person.

(This replaces check_triage_credentials.py, which asked whether an Anthropic
key was present. That is the wrong question now: a local Ollama server has no
credential at all, and the thing worth checking is whether a tier comes back.)
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

# Run as a script from backend/, so `app` is not importable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

STUB_PORT = 8931

# Deliberately vague: the rule layer has nothing to match, so it defaults to
# URGENT with canned text. Any description-specific reasoning in the output
# therefore came from the model, which is what is being tested.
PROBE = "I have been feeling off since this morning and my stomach is unsettled."

# Shown in --stub mode. Each is chosen to exercise a different arm of the
# reconciliation against a model that always says SELF_CARE.
STUB_CASES = [
    ("crushing chest pain going down my left arm", "EMERGENT", "red flag beats the model"),
    ("something feels odd in my left foot", "URGENT", "rule default beats the model"),
    ("mild sore throat", "SELF_CARE", "rules agree, so SELF_CARE is earned"),
]


# ---------------------------------------------------------------------------
# The fake endpoint used by --stub. Adversarial on purpose.
# ---------------------------------------------------------------------------


class _StubModel(BaseHTTPRequestHandler):
    """
    An OpenAI-compatible endpoint that reads both screens, then always
    concludes SELF_CARE with reassuring wording.

    It is the worst well-formed model the loop could be given: it follows the
    protocol and argues for the least care every time. Whatever comes out of a
    run against it came out of the deterministic layers.
    """

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))

        screens_read = sum(
            1
            for m in body["messages"]
            if m.get("role") == "tool" and "Rule tier:" in str(m.get("content"))
        )

        if not screens_read:
            calls = [
                _call("c1", "screen_red_flags", {}),
                _call("c2", "apply_rules", {}),
            ]
        else:
            calls = [
                _call(
                    "c3",
                    "conclude",
                    {
                        "tier": "SELF_CARE",
                        "reasoning": "This is nothing to worry about, you'll be fine.",
                        "confidence": "HIGH",
                    },
                )
            ]

        raw = json.dumps(
            {
                "model": "stub-adversarial-model",
                "choices": [
                    {
                        "finish_reason": "tool_calls",
                        "message": {"content": "", "tool_calls": calls},
                    }
                ],
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def _call(cid: str, name: str, args: dict) -> dict:
    return {
        "id": cid,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


def _start_stub() -> HTTPServer:
    os.environ["LLM_BASE_URL"] = f"http://127.0.0.1:{STUB_PORT}/v1"
    os.environ["LLM_MODEL"] = "stub-adversarial-model"
    os.environ["LLM_API_KEY"] = ""
    os.environ.setdefault("ENVIRONMENT", "local")

    server = HTTPServer(("127.0.0.1", STUB_PORT), _StubModel)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_configuration() -> bool:
    """Say which layer will run. Returns False when none will."""
    from app.core import triage
    from app.services import llm

    print("Configuration")
    if llm.configured():
        from app.core.config import settings

        local = llm.endpoint_is_local()
        print("  layer      agentic deduction (app/core/deduction.py)")
        print(f"  endpoint   {settings.llm_base_url}")
        print(f"  model      {settings.llm_model}")
        print(
            f"  privacy    {'LOCAL — the description does not leave this machine'
                            if local else
                            'HOSTED — the description IS TRANSMITTED to this vendor, '
                            'and there is no BAA'}"
        )
    elif triage.credentials_available():
        print("  layer      one-shot Anthropic (app/core/triage.py)")
        print(f"  model      {triage.TRIAGE_MODEL}")
        print("  privacy    HOSTED — the description IS TRANSMITTED to Anthropic, no BAA")
    else:
        print("  layer      NONE — rules only")
        print()
        print("  Nothing is broken: every description still gets a tier and red-flag")
        print("  screening is unaffected. But no model is being consulted, so the")
        print("  explanation is a canned sentence and no clarifying question can be asked.")
        print()
        print("  For the free agentic layer, put this in backend/.env:")
        print("      LLM_BASE_URL=http://localhost:11434/v1")
        print("      LLM_MODEL=llama3.1")
        print("  See docs/free-model-setup.md. Or run this script with --stub.")
        return False
    print()
    return True


def _report(description: str, expected: str | None = None) -> bool:
    from app.core.triage import TriageUnavailable, assess

    print(f"  {description!r}")
    try:
        result = assess(description)
    except TriageUnavailable as exc:
        print(f"    FAILED: {exc}")
        print("    Intake would return 503 here — deliberately never a tier.")
        return False

    ok = expected is None or result.tier.name == expected
    mark = "    " if expected is None else f"  [{'PASS' if ok else 'FAIL'}] "
    print(f"{mark}final={result.tier.name}"
          f"  rules={result.rule_tier.name if result.rule_tier else '-'}"
          f"  model={result.model_tier.name if result.model_tier else 'None'}"
          f"  escalated={result.escalated_by_safety_net}")

    if result.deduction_trace:
        print("    derivation:")
        for line in result.deduction_trace:
            print(f"      · {line}")
    if result.emergency:
        print(f"    emergency: {result.emergency.headline}")
    print(f"    shown to the user: {result.reasoning}")
    print()
    return ok


def main() -> int:
    args = [a for a in sys.argv[1:]]
    stub = "--stub" in args
    if stub:
        args.remove("--stub")

    server = _start_stub() if stub else None

    if not _print_configuration():
        return 1

    if stub:
        print("The model below is a FAKE that always answers SELF_CARE with reassuring")
        print("wording. Everything else — the HTTP client, the tool loop, the screens,")
        print("the reconciliation — is the real thing.\n")
        print("Assessments")
        failures = sum(not _report(d, expected) for d, expected, _ in STUB_CASES)
        if server:
            server.shutdown()
        if failures:
            print(f"{failures} CHECK(S) FAILED — the safety net did not hold.")
            return 1
        print("All checks passed: the model never talked a tier down.")
        return 0

    print("Assessments")
    ok = _report(args[0] if args else PROBE)
    if not ok:
        return 1
    print("If the reasoning above is written to what you typed, the model layer is")
    print("working. If it is a canned paragraph, the model was not consulted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
