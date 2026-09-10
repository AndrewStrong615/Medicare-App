"""
Add the supply columns to an existing `medications` table.

WHY THIS EXISTS RATHER THAN A MIGRATION: CLAUDE.md names Alembic as the
migration tool, but it is not wired up yet — tables come from
`Base.metadata.create_all`, which creates missing tables and **never alters
existing ones**. The refill estimate added three columns to a table that
already exists, so a database created before them will raise on the next
select. Same gap, and same shape of workaround, as
`add_intake_audit_columns.py`.

⛔ The deployment start command runs `create_missing_tables.py`, which will
not do this. A deploy of the refill-alert change onto an existing database
needs this script run once, by hand, or `/medications` starts returning 500s.

All three columns are nullable with no default, so adding them changes no
existing row: a medication recorded before this simply has no estimate, which
is the same state as one recorded after it and left blank.

Idempotent — safe to run more than once. Run from `backend/`:

    python scripts/add_medication_supply_columns.py
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
    "ALTER TABLE medications ADD COLUMN IF NOT EXISTS quantity_remaining INTEGER",
    "ALTER TABLE medications ADD COLUMN IF NOT EXISTS quantity_counted_on DATE",
    "ALTER TABLE medications ADD COLUMN IF NOT EXISTS doses_per_day INTEGER",
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
