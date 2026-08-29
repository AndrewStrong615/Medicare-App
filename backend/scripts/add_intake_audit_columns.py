"""
Add the new `intake_assessments` audit columns to an existing database.

WHY THIS EXISTS RATHER THAN A MIGRATION: CLAUDE.md names Alembic as the
migration tool, but it is not wired up yet — tables come from
`Base.metadata.create_all`, which creates missing tables and never alters
existing ones. So a dev database created before these columns were added will
raise on the next insert. This closes that gap for dev; it is not a
replacement for setting Alembic up properly before anything real runs.

Idempotent — safe to run more than once. Run from `backend/`:

    python scripts/add_intake_audit_columns.py
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
    "ALTER TABLE intake_assessments ADD COLUMN IF NOT EXISTS model_confidence VARCHAR(10)",
    "ALTER TABLE intake_assessments ADD COLUMN IF NOT EXISTS followup_answers TEXT",
    "ALTER TABLE intake_assessments ADD COLUMN IF NOT EXISTS exhausted_followup "
    "BOOLEAN NOT NULL DEFAULT FALSE",
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
