"""
Tests for the licensed-protocol container.

The most important test in this file is `test_no_protocol_content_is
_committed_to_this_repository`. Everything else checks that the loader fails
closed; that one checks that the thing it loads has not been quietly invented.
"""

import json

import pytest

from app.core import protocol_content
from app.core.protocol_content import ProtocolContentError

# A minimal, WELL-FORMED payload used only to exercise the validator.
#
# ⛔ This is deliberately not clinical content. The complaint is a placeholder,
# the question is about the shape of the format, and the disposition label is
# generic. It exists to prove the parser rejects malformed input, and it must
# never grow into a plausible-looking protocol — see the module docstring.
_SHAPE_ONLY = {
    "source": {"name": "Example Licensor", "version": "0.0-test"},
    "protocols": [
        {
            "id": "placeholder",
            "complaint": "Placeholder Complaint",
            "questions": ["A question the licensed content would ask"],
            "dispositions": [
                {"id": "d1", "label": "A disposition the content defines", "tier": "URGENT"}
            ],
        }
    ],
}


# ---------------------------------------------------------------------------
# The repository ships no content. This is the one that matters.
# ---------------------------------------------------------------------------


def test_no_protocol_content_is_committed_to_this_repository():
    """
    No file in the tree may look like a loadable protocol set.

    Clinical content in this repository would be content an engineer or an
    agent wrote, behind an interface built for content a physician reviewed.
    CLAUDE.md forbids the first and the whole point of the module is the
    second.
    """
    repo_root = protocol_content.Path(__file__).resolve().parents[2]
    offenders = []
    for path in repo_root.rglob("*.json"):
        parts = set(path.parts)
        if parts & {"node_modules", ".git", "__pycache__", ".claude"}:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        if isinstance(payload, dict) and "protocols" in payload and "source" in payload:
            offenders.append(str(path.relative_to(repo_root)))

    assert offenders == [], (
        f"protocol-shaped content found in the repository: {offenders}. "
        "Licensed content is loaded from outside the tree."
    )


def test_unconfigured_is_unavailable_and_loads_nothing():
    """The state this repository always ships in."""
    assert protocol_content.content_dir() is None
    assert protocol_content.load() is None
    assert protocol_content.available() is False


# ---------------------------------------------------------------------------
# Fails closed.
# ---------------------------------------------------------------------------


def test_a_configured_directory_that_does_not_exist_is_an_error(monkeypatch, tmp_path):
    missing = tmp_path / "nope"
    monkeypatch.setattr(
        protocol_content.settings, "protocol_content_dir", str(missing)
    )

    with pytest.raises(ProtocolContentError):
        protocol_content.load()


def test_a_configured_directory_with_no_protocols_is_an_error(monkeypatch, tmp_path):
    monkeypatch.setattr(
        protocol_content.settings, "protocol_content_dir", str(tmp_path)
    )

    with pytest.raises(ProtocolContentError):
        protocol_content.load()


def test_unusable_content_reports_unavailable_rather_than_crashing(
    monkeypatch, tmp_path
):
    """
    A broken licence directory must not take the API down.

    The rule layer carries the feature alone, exactly as a missing model key
    degrades quality without breaking triage.
    """
    (tmp_path / "broken.json").write_text("{ not json", encoding="utf-8")
    monkeypatch.setattr(
        protocol_content.settings, "protocol_content_dir", str(tmp_path)
    )

    assert protocol_content.available() is False


def test_a_disposition_without_a_tier_is_rejected():
    payload = json.loads(json.dumps(_SHAPE_ONLY))
    del payload["protocols"][0]["dispositions"][0]["tier"]

    with pytest.raises(ProtocolContentError, match="tier"):
        protocol_content.parse(payload)


def test_a_disposition_with_an_unknown_tier_is_rejected():
    payload = json.loads(json.dumps(_SHAPE_ONLY))
    payload["protocols"][0]["dispositions"][0]["tier"] = "SEE_WITHIN_4_HOURS"

    with pytest.raises(ProtocolContentError, match="not one of"):
        protocol_content.parse(payload)


def test_a_protocol_with_no_dispositions_is_rejected():
    payload = json.loads(json.dumps(_SHAPE_ONLY))
    payload["protocols"][0]["dispositions"] = []

    with pytest.raises(ProtocolContentError, match="dispositions"):
        protocol_content.parse(payload)


def test_an_empty_protocol_list_is_rejected():
    payload = json.loads(json.dumps(_SHAPE_ONLY))
    payload["protocols"] = []

    with pytest.raises(ProtocolContentError):
        protocol_content.parse(payload)


def test_missing_attribution_is_rejected():
    payload = json.loads(json.dumps(_SHAPE_ONLY))
    del payload["source"]

    with pytest.raises(ProtocolContentError):
        protocol_content.parse(payload)


def test_duplicate_protocol_ids_are_rejected():
    payload = json.loads(json.dumps(_SHAPE_ONLY))
    payload["protocols"].append(dict(payload["protocols"][0]))

    with pytest.raises(ProtocolContentError, match="duplicate"):
        protocol_content.parse(payload)


def test_one_bad_protocol_rejects_the_whole_set(monkeypatch, tmp_path):
    """Half a protocol set is a set with unknown holes in it."""
    good = json.loads(json.dumps(_SHAPE_ONLY))
    bad = json.loads(json.dumps(_SHAPE_ONLY))
    bad["protocols"][0]["id"] = "second"
    del bad["protocols"][0]["complaint"]

    (tmp_path / "a.json").write_text(json.dumps(good), encoding="utf-8")
    (tmp_path / "b.json").write_text(json.dumps(bad), encoding="utf-8")
    monkeypatch.setattr(
        protocol_content.settings, "protocol_content_dir", str(tmp_path)
    )

    with pytest.raises(ProtocolContentError):
        protocol_content.load()


def test_mixed_content_revisions_are_rejected(monkeypatch, tmp_path):
    first = json.loads(json.dumps(_SHAPE_ONLY))
    second = json.loads(json.dumps(_SHAPE_ONLY))
    second["protocols"][0]["id"] = "second"
    second["source"]["version"] = "9.9-different"

    (tmp_path / "a.json").write_text(json.dumps(first), encoding="utf-8")
    (tmp_path / "b.json").write_text(json.dumps(second), encoding="utf-8")
    monkeypatch.setattr(
        protocol_content.settings, "protocol_content_dir", str(tmp_path)
    )

    with pytest.raises(ProtocolContentError, match="revisions|does not match"):
        protocol_content.load()


def test_a_parse_failure_does_not_quote_the_content(monkeypatch, tmp_path):
    """
    A protocol set is licensed material. An error naming its text would put it
    in the application log, the same rule `llm.chat` follows for a provider
    error body that can quote the user's own health text.
    """
    secret = "A licensed protocol question that must not reach the log"
    (tmp_path / "broken.json").write_text(
        '{"source": {"name": "x", "version": "1"}, "protocols": [{"id": "a", '
        f'"complaint": "c", "questions": ["{secret}"], "dispositions": []}}]}}',
        encoding="utf-8",
    )
    monkeypatch.setattr(
        protocol_content.settings, "protocol_content_dir", str(tmp_path)
    )

    with pytest.raises(ProtocolContentError) as excinfo:
        protocol_content.load()

    assert secret not in str(excinfo.value)


# ---------------------------------------------------------------------------
# A valid set parses, and reconciliation is one-directional.
# ---------------------------------------------------------------------------


def test_a_well_formed_set_parses():
    parsed = protocol_content.parse(_SHAPE_ONLY)

    assert parsed.attribution == "Example Licensor (0.0-test)"
    assert len(parsed.protocols) == 1
    assert parsed.by_complaint("placeholder complaint") is not None
    assert parsed.by_complaint("something else") is None


@pytest.mark.parametrize(
    "rule_tier,protocol_tier,expected",
    [
        ("SELF_CARE", "URGENT", "URGENT"),
        ("URGENT", "SELF_CARE", "URGENT"),
        ("EMERGENT", "SELF_CARE", "EMERGENT"),
        ("SELF_CARE", "EMERGENT", "EMERGENT"),
        ("URGENT", "URGENT", "URGENT"),
        ("EMERGENT", "URGENT", "EMERGENT"),
    ],
)
def test_reconcile_never_lowers_a_tier(rule_tier, protocol_tier, expected):
    assert protocol_content.reconcile(rule_tier, protocol_tier) == expected


def test_reconcile_rejects_an_unknown_tier():
    with pytest.raises(ValueError):
        protocol_content.reconcile("URGENT", "MAYBE")


def test_protocol_content_is_not_wired_into_the_triage_path():
    """
    ⛔ Built, gated and unreachable — on purpose.

    Attaching a new source of tiers to the live path is a change to the safety
    architecture: it needs the owner's explicit approval and a clinician's
    read of the integration. If this test fails because the module is now
    imported by the triage layer, that approval is what to go and get.
    """
    import app.core.rules_triage as rules_module
    import app.core.triage as triage_module

    for module in (rules_module, triage_module):
        source = protocol_content.Path(module.__file__).read_text(encoding="utf-8")
        assert "protocol_content" not in source, (
            f"{module.__name__} now references protocol_content"
        )
