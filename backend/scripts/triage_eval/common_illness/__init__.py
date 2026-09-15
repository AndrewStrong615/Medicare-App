"""
The 10,000-case common-illness corpus and its measurement.

SYNTHETIC ONLY, and more emphatically here than anywhere else in the
repository: this package is nothing but symptom descriptions. Every one was
written by an engineer against no real person. Never paste anything a real
person wrote into it.

See `presentations.py` for how a gold tier is assigned — in particular the one
rule the whole corpus rests on, that EMERGENT is only ever used where
`app.core.emergency` already defines a category covering the description.
"""

from .generate import (
    CASES,
    TARGET_CASES,
    TIER_RANK,
    TIERS,
    Case,
    build_all,
    catalogue_size,
)

__all__ = [
    "CASES",
    "TARGET_CASES",
    "TIER_RANK",
    "TIERS",
    "Case",
    "build_all",
    "catalogue_size",
]
