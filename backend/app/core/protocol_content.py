"""
Loader for a LICENSED telephone-triage protocol set. Ships with no content.

## Why this exists

Every phrase in `rules_triage.py` and `emergency.py` was, in that file's own
words, "written by a software engineer". That is the release blocker recorded
in CLAUDE.md, and it is not a blocker that more phrases can clear: the problem
is authorship, not coverage. The fix is to stop being the author and load
content somebody qualified wrote — a licensed telephone-triage protocol set of
the kind medical call centres run on, reviewed by practising physicians and
revised against current literature.

This module is the container for that content. It is deliberately **all
container and no content**.

## ⛔ What is NOT here, and must never be added

**No protocol content.** Not a sample, not a fixture, not "just one to show
the shape". A protocol written by an agent or an engineer and loaded through
this interface would be unreviewed clinical content wearing the interface
built for reviewed clinical content — strictly worse than the phrase lists,
which at least say plainly what they are. `tests/test_protocol_content.py`
asserts no content file exists in this repository.

**No disposition-to-tier mapping of our own.** Deciding that "be seen within
24 hours" means URGENT rather than EMERGENT is a clinical judgement, so the
loader *requires* each disposition to state its tier and refuses content that
omits one. The mapping arrives with the content, or with the clinician who
reviews the integration. It is never inferred here.

## Built, gated, and unreachable

Nothing calls this module. It is not wired into `rules_triage.classify` or
`triage.py`, exactly as `BookingIdentityScreen` is built and unreachable
behind `delivery_available()`. Two reasons:

* With no content it would be a no-op on every request, so wiring it in buys
  nothing and costs a change to a fenced module.
* Attaching a new source of tiers to the live triage path is a change to the
  safety architecture and needs the owner's explicit approval and a
  clinician's read of the integration — the audit CLAUDE.md describes, and
  which a licence normally requires anyway.

`reconcile()` below is the whole of the intended attachment, and it is written
so that a reviewer can see it cannot lower a tier.

## Fails closed

Any malformed protocol rejects the **entire** set rather than loading the part
that parsed. Half a protocol set is not a smaller protocol set: it is a set
with unknown holes in it, and a hole in triage content reads as "nothing to
worry about". `available()` returns False whenever loading did not fully
succeed.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


# The app's three tiers. A disposition must name one of these; the loader does
# not translate, rank or infer.
_VALID_TIERS = frozenset({"SELF_CARE", "URGENT", "EMERGENT"})

_TIER_RANK = {"SELF_CARE": 1, "URGENT": 2, "EMERGENT": 3}


class ProtocolContentError(Exception):
    """Content was present but unusable. Never raised for absent content."""


@dataclass(frozen=True)
class Disposition:
    """
    One outcome a protocol can reach.

    `label` is the licensed content's own wording. Whether it may be shown to
    a user verbatim is a licence question, not an engineering one — most
    licences require exactly that and forbid paraphrasing, which is the same
    discipline this app already applies to MedlinePlus text and to a
    prescription label's directions.

    `tier` is which of the app's three tiers this disposition corresponds to,
    stated by the content rather than derived here.
    """

    id: str
    label: str
    tier: str


@dataclass(frozen=True)
class Protocol:
    """One presenting complaint, its question set, and its dispositions."""

    id: str
    complaint: str
    questions: tuple[str, ...]
    dispositions: tuple[Disposition, ...]


@dataclass(frozen=True)
class ProtocolSource:
    """Who published the content, and which revision this is."""

    name: str
    version: str


@dataclass(frozen=True)
class ProtocolSet:
    source: ProtocolSource
    protocols: tuple[Protocol, ...]

    def by_complaint(self, complaint: str) -> Protocol | None:
        wanted = complaint.strip().casefold()
        for protocol in self.protocols:
            if protocol.complaint.casefold() == wanted:
                return protocol
        return None

    @property
    def attribution(self) -> str:
        """What must accompany any rendering of this content."""
        return f"{self.source.name} ({self.source.version})"


def content_dir() -> Path | None:
    """The configured content directory, or None when none is set."""
    raw = (settings.protocol_content_dir or "").strip()
    if not raw:
        return None
    return Path(raw)


def _require(mapping: object, key: str, where: str) -> object:
    if not isinstance(mapping, dict):
        raise ProtocolContentError(f"{where}: expected an object")
    if key not in mapping:
        raise ProtocolContentError(f"{where}: missing {key!r}")
    return mapping[key]


def _require_text(mapping: object, key: str, where: str) -> str:
    value = _require(mapping, key, where)
    if not isinstance(value, str) or not value.strip():
        raise ProtocolContentError(f"{where}: {key!r} must be a non-empty string")
    return value.strip()


def _parse_disposition(raw: object, where: str) -> Disposition:
    tier = _require_text(raw, "tier", where)
    if tier not in _VALID_TIERS:
        raise ProtocolContentError(
            f"{where}: tier {tier!r} is not one of {sorted(_VALID_TIERS)}. "
            "The content states which tier a disposition corresponds to; this "
            "loader does not infer it."
        )
    return Disposition(
        id=_require_text(raw, "id", where),
        label=_require_text(raw, "label", where),
        tier=tier,
    )


def _parse_protocol(raw: object, index: int) -> Protocol:
    where = f"protocol[{index}]"
    protocol_id = _require_text(raw, "id", where)

    raw_questions = _require(raw, "questions", where)
    if not isinstance(raw_questions, list):
        raise ProtocolContentError(f"{where}: 'questions' must be a list")
    questions = tuple(
        _require_text({"q": q}, "q", f"{where}.questions[{i}]")
        for i, q in enumerate(raw_questions)
    )

    raw_dispositions = _require(raw, "dispositions", where)
    if not isinstance(raw_dispositions, list) or not raw_dispositions:
        raise ProtocolContentError(
            f"{where}: 'dispositions' must be a non-empty list. A protocol "
            "that cannot reach a disposition cannot triage anything."
        )
    dispositions = tuple(
        _parse_disposition(d, f"{where}.dispositions[{i}]")
        for i, d in enumerate(raw_dispositions)
    )

    return Protocol(
        id=protocol_id,
        complaint=_require_text(raw, "complaint", where),
        questions=questions,
        dispositions=dispositions,
    )


def parse(payload: object) -> ProtocolSet:
    """
    Validate a whole protocol set, or raise.

    Separate from `load()` so the validation can be tested without a file on
    disk — and so no test ever needs to write protocol content into the tree.
    """
    raw_source = _require(payload, "source", "content")
    source = ProtocolSource(
        name=_require_text(raw_source, "name", "content.source"),
        version=_require_text(raw_source, "version", "content.source"),
    )

    raw_protocols = _require(payload, "protocols", "content")
    if not isinstance(raw_protocols, list) or not raw_protocols:
        raise ProtocolContentError("content: 'protocols' must be a non-empty list")

    protocols = tuple(
        _parse_protocol(raw, i) for i, raw in enumerate(raw_protocols)
    )

    seen: set[str] = set()
    for protocol in protocols:
        if protocol.id in seen:
            raise ProtocolContentError(f"duplicate protocol id {protocol.id!r}")
        seen.add(protocol.id)

    return ProtocolSet(source=source, protocols=protocols)


def load() -> ProtocolSet | None:
    """
    Load the configured protocol set, or None when none is configured.

    Returns None for "no licence, nothing to load" — the ordinary state — and
    raises `ProtocolContentError` for "content is present but unusable", which
    is a misconfiguration somebody has to fix rather than a state to run in.
    """
    directory = content_dir()
    if directory is None:
        return None

    if not directory.is_dir():
        raise ProtocolContentError(
            f"PROTOCOL_CONTENT_DIR is set to {directory} which is not a directory"
        )

    files = sorted(directory.glob("*.json"))
    if not files:
        raise ProtocolContentError(f"no .json protocol files in {directory}")

    merged: list[Protocol] = []
    source: ProtocolSource | None = None
    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            # The message names the file and the failure type, never the
            # content: a protocol set is licensed material and a parse error
            # can quote it into the log.
            raise ProtocolContentError(
                f"{path.name}: unreadable ({type(exc).__name__})"
            ) from exc

        parsed = parse(payload)
        if source is None:
            source = parsed.source
        elif (source.name, source.version) != (parsed.source.name, parsed.source.version):
            raise ProtocolContentError(
                f"{path.name}: source {parsed.attribution!r} does not match "
                f"{ProtocolSet(source, ()).attribution!r} from an earlier file. "
                "Mixing revisions of triage content is not a merge, it is an "
                "unknown instrument."
            )
        merged.extend(parsed.protocols)

    assert source is not None  # non-empty `files` guarantees one parse ran
    return ProtocolSet(source=source, protocols=tuple(merged))


def available() -> bool:
    """
    Whether licensed protocol content is loaded and usable.

    ⛔ Do not make this return True to unlock anything. Like
    `request_delivery.delivery_available()`, it stands for a signed agreement —
    here, a content licence. Returning True with no licence means either
    running on content nobody reviewed, or shipping licensed content this
    project has no right to redistribute.
    """
    try:
        return load() is not None
    except ProtocolContentError:
        logger.warning(
            "Protocol content is configured but unusable; running on the "
            "built-in rule layer alone. Fix the content or unset "
            "PROTOCOL_CONTENT_DIR."
        )
        return False


def reconcile(rule_tier: str, protocol_tier: str) -> str:
    """
    Combine a protocol disposition with the rule layer's tier. Never lowers.

    This is the whole of the intended attachment to the live path, and it is
    the same `max()` the model layer is reconciled with in `triage.py`: either
    source may escalate and neither may de-escalate. Licensed content being
    better than the phrase lists is not a reason to let it talk a red flag
    down — the rule layer's emergency screening runs first and sets a floor,
    and that property does not become negotiable because the content improved.
    """
    for tier in (rule_tier, protocol_tier):
        if tier not in _VALID_TIERS:
            raise ValueError(f"unknown tier {tier!r}")
    return max(rule_tier, protocol_tier, key=lambda t: _TIER_RANK[t])
