"""
Expands the presentation catalogue into exactly 10,000 scored cases.

Deterministic: no randomness, no seed, no clock. The same catalogue always
produces the same 10,000 descriptions in the same order, which is what makes
a number from this comparable between runs and a regression attributable to a
diff rather than to luck.

## The three axes

    presentation  x  lay complaint  x  sentence template  ->  description

and then a **surface transform** chosen by position, so the corpus exercises
the forms text actually arrives in rather than only clean prose: curly
apostrophes (what iOS substitutes as you type), block capitals, trailing
punctuation and doubled spaces, and run-together pasted clauses.

## How a template may change the gold tier

A template is either `neutral` — it wraps the complaint in ordinary
conversational framing and cannot change what tier is correct — or it
`escalates`, meaning it adds wording this app's own documented intent treats
as an escalating modifier ("and it is getting worse", "for over a week now").

For an escalating template the gold tier becomes `max(gold, URGENT)`. That is
not a clinical judgement: `_ESCALATING_MODIFIERS` in `rules_triage.py` and the
`persistent_or_worsening` urgent rule both already say so, and CLAUDE.md
states the principle directly — "a recognised self-limiting complaint with an
escalating modifier is not the ordinary case the self-care list assumes".

⛔ No template may *lower* a gold tier, and none does. There is no wording a
wrapper could add that would make a stroke description safe, and a corpus that
claimed otherwise would be encoding the one thing the whole safety
architecture forbids.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from . import cardio_neuro, derm_msk, gi_gu, mental_peds_misc, more, presentations
from .presentations import Presentation

TIERS = ("SELF_CARE", "URGENT", "EMERGENT")
TIER_RANK = {tier: i for i, tier in enumerate(TIERS)}

TARGET_CASES = 10_000


CATALOGUE: list[Presentation] = [
    *presentations.RESPIRATORY,
    *cardio_neuro.CARDIO,
    *cardio_neuro.NEURO,
    *cardio_neuro.ENDOCRINE,
    *gi_gu.GI,
    *gi_gu.GU,
    *derm_msk.DERM,
    *derm_msk.MSK,
    *derm_msk.EYE_DENTAL,
    *derm_msk.INJURY,
    *mental_peds_misc.MENTAL,
    *mental_peds_misc.PEDS,
    *mental_peds_misc.INFECTIOUS,
    *mental_peds_misc.GENERAL,
    *more.MORE,
]


@dataclass(frozen=True)
class Template:
    text: str  # contains "{c}"
    escalates: bool = False


# Ordinary conversational framing. None of these contains a word any rule
# list watches for, so none can change a tier on its own.
TEMPLATES: tuple[Template, ...] = (
    Template("{c}"),
    Template("I have {c}"),
    Template("I've got {c}"),
    Template("hi, I have {c} and I am not sure what to do"),
    Template("I woke up with {c}"),
    Template("{c}. should I be worried?"),
    Template("I am dealing with {c} today"),
    Template("{c} since this morning"),
    Template("my husband has {c}"),
    Template("I have been having {c}"),
    Template("there is {c} and it started yesterday"),
    Template("{c}, what should I do"),
    Template("not really sure what is going on, {c}"),
    Template("{c} right now"),
    Template("my wife has {c} and asked me to look it up"),
    Template("{c} — any idea what this is?"),
    Template("been googling {c} and got nowhere"),
    Template("my son has {c}"),
    # Escalating. Both phrases are already in _ESCALATING_MODIFIERS and in the
    # persistent_or_worsening urgent rule, so the raised gold is this app's
    # own documented intent rather than an opinion added here.
    Template("{c} and it is getting worse", escalates=True),
    Template("{c} for over a week now", escalates=True),
)


# ---------------------------------------------------------------------------
# Surface transforms — the shapes text actually arrives in.
# ---------------------------------------------------------------------------

def _identity(text: str) -> str:
    return text


def _curly(text: str) -> str:
    """What an iPhone substitutes as you type. normalize_query folds it back."""
    return text.replace("'", "’")


def _shout(text: str) -> str:
    """Block capitals. Every phrase list is compiled IGNORECASE."""
    return text.upper()


def _messy(text: str) -> str:
    """Doubled spaces and trailing punctuation, as typed in a hurry."""
    return "  " + text.replace(" ", "  ", 3) + " ...  "


def _glued(text: str) -> str:
    """
    Run-together pasted clauses: "chest painShortness of breath".

    The exact shape of the real submission that produced the normalize_query
    fix recorded in CLAUDE.md. Only applied where there is an " and " to glue
    at; otherwise the text is returned unchanged and the case is an ordinary
    one.
    """
    if " and " not in text:
        return text
    head, _, tail = text.partition(" and ")
    return head + tail[:1].upper() + tail[1:]


TRANSFORMS = (
    ("plain", _identity),
    ("plain", _identity),
    ("plain", _identity),
    ("plain", _identity),
    ("plain", _identity),
    ("plain", _identity),
    ("curly", _curly),
    ("shout", _shout),
    ("messy", _messy),
    ("glued", _glued),
)


@dataclass(frozen=True)
class Case:
    description: str
    gold: str
    basis: str
    natural: bool
    presentation: str
    label: str
    template: str
    surface: str
    # Non-empty where CLAUDE.md records this as currently missed on purpose.
    # Excluded from the scores and listed in full, the same way corpus.py
    # handles its "documented gap" basis — a known, reported, unfixed gap is
    # visible rather than averaged away, and is not the same thing as a
    # regression.
    documented_gap: str = ""


COPIED_MARKER = "="


def _max_tier(a: str, b: str) -> str:
    return a if TIER_RANK[a] >= TIER_RANK[b] else b


def _build_cross_product() -> list[Case]:
    """Every (presentation, complaint, template) triple, surfaced."""
    cases: list[Case] = []
    index = 0

    for template in TEMPLATES:
        for pres in CATALOGUE:
            for raw in pres.complaints:
                copied = raw.startswith(COPIED_MARKER)
                complaint = raw[1:] if copied else raw

                base = template.text.format(c=complaint)
                surface_name, transform = TRANSFORMS[index % len(TRANSFORMS)]
                description = transform(base)
                index += 1

                gold = pres.gold
                basis = pres.basis
                if template.escalates:
                    raised = _max_tier(gold, "URGENT")
                    if raised != gold:
                        basis = f"{basis} + escalating modifier in template"
                    gold = raised

                gap = ""
                if pres.two_concept and surface_name == "glued":
                    gap = (
                        "two-concept red flag with the conjunction lost to a "
                        "paste; needs a symptom_concepts combination, which "
                        "CLAUDE.md fences at three"
                    )

                cases.append(
                    Case(
                        description=description,
                        gold=gold,
                        basis=basis,
                        documented_gap=gap,
                        # A phrase copied out of a rule list is not natural
                        # phrasing however it is wrapped; matching your own
                        # list is the easy half of the problem.
                        natural=not copied,
                        presentation=pres.key,
                        label=pres.label,
                        template=template.text,
                        surface=surface_name,
                    )
                )

    return cases


def _selection_key(case: Case) -> str:
    """
    Stable, content-derived sort key for choosing which cases are scored.

    ⛔ It must not depend on position. An earlier version strided by index,
    and adding one presentation to the catalogue reshuffled which cases were
    in the scored 10,000 — so a run after a fix reported a different set of
    failures than the run before it, and neither number was comparable to the
    other. A failure that vanished might have been fixed or might simply have
    been sampled out, and nothing in the output told you which.

    Hashing the description instead means a case's membership depends only on
    the case. Adding presentations adds candidates; it does not move the ones
    already there.
    """
    return hashlib.sha256(case.description.encode("utf-8")).hexdigest()


def _trim(cases: list[Case]) -> list[Case]:
    """
    Cut to exactly TARGET_CASES, stably, keeping every axis represented.

    Selection is by content hash (see `_selection_key`), then the result is
    restored to catalogue order so the output reads in a sensible sequence.

    `measure_common_illness.py --all` scores the full cross product instead,
    which is what stops the trim from hiding a failure: if the 10,000 are
    clean and the full set is not, the difference is visible rather than
    silently sampled away.
    """
    total = len(cases)
    if total <= TARGET_CASES:
        return cases

    order = {id(c): i for i, c in enumerate(cases)}
    chosen = sorted(cases, key=_selection_key)[:TARGET_CASES]
    return sorted(chosen, key=lambda c: order[id(c)])


def build_all() -> list[Case]:
    """The full cross product, untrimmed. Used by `--all`."""
    return _ALL_CASES


def catalogue_size() -> dict[str, int]:
    return {
        "presentations": len(CATALOGUE),
        "complaints": sum(len(p.complaints) for p in CATALOGUE),
        "templates": len(TEMPLATES),
        "cross_product": len(_ALL_CASES),
        "scored": len(CASES),
    }


_ALL_CASES: list[Case] = _build_cross_product()
CASES: list[Case] = _trim(_ALL_CASES)
