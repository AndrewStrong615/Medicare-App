"""
Add the detail and evidence columns to an existing `goal_activities` table.

WHY THIS EXISTS RATHER THAN A MIGRATION: the same gap as
`add_goal_schedule_columns.py`, `add_medication_supply_columns.py` and
`add_intake_audit_columns.py`. Alembic is named in CLAUDE.md but is not wired
up; tables come from `Base.metadata.create_all`, which creates missing tables
and **never alters existing ones**. These two columns went onto a table that
already exists.

⛔ Without this, `/goals` returns 500s on any database created before
2026-09-13. The deployment start command runs it; a database created by hand
needs it run once.

## What the columns are, and why neither is backfilled

`detail` is one or two sentences saying how to do an activity, proposed by the
planner and edited by the person before anything is saved. Nullable, no
default: a goal saved before this does not acquire instructions nobody wrote.

`evidence_domain` is an id into `app/core/goal_evidence.py` — NOT a citation.
The publisher, document title, verbatim quote and link live in that module
alone, so a government quotation cannot go stale in a database row, and an id
that no longer resolves renders as no citation at all. Nullable, no default: a
row recorded before this was never attributed to anything, and inventing an
attribution for it is precisely the failure the register is built to prevent.

⛔ Do not backfill either column with a guess, and in particular do not map old
rows to a domain by matching words in their text. An activity attributed to a
guideline nobody chose for it is a fabricated citation on a real person's plan.

Idempotent — safe to run more than once. Run from `backend/`:

    python scripts/add_goal_detail_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db.session import engine  # noqa: E402

# ADD COLUMN IF NOT EXISTS is Postgres 9.6+, which is what makes this
# re-runnable without checking the catalogue first.
STATEMENTS = (
    "ALTER TABLE goal_activities ADD COLUMN IF NOT EXISTS detail VARCHAR(400)",
    "ALTER TABLE goal_activities "
    "ADD COLUMN IF NOT EXISTS evidence_domain VARCHAR(60)",
)


def main() -> int:
    print(f"Database: {settings.database_url.rsplit('@', 1)[-1]}")

    with engine.begin() as connection:
        for statement in STATEMENTS:
            connection.execute(text(statement))
            print(f"  ok: {statement.split('IF NOT EXISTS ')[-1]}")

    print("\nDone. Columns are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
