"""
Add the daily-schedule columns to an existing `goal_activities` table.

WHY THIS EXISTS RATHER THAN A MIGRATION: CLAUDE.md names Alembic as the
migration tool, but it is not wired up yet — tables come from
`Base.metadata.create_all`, which creates missing tables and **never alters
existing ones**. The daily schedule added two columns to a table that already
exists, so a database created before them will raise on the next select. Same
gap, and same shape of workaround, as `add_medication_supply_columns.py` and
`add_intake_audit_columns.py`.

⛔ Without this, `/goals` returns 500s on any database created before the
change. The deployment start command runs it; a database anyone created by
hand needs it run once.

## What the defaults mean

`days` is NOT NULL with a default of the empty string, because the model
declares it non-nullable and an existing row has to satisfy that. Empty means
"no particular day", which is exactly what a goal recorded before schedules
existed had — no schedule was ever collected for it, so none is invented for
it here.

`time_of_day` is nullable with no default, for the same reason. A goal saved
last week does not acquire an 08:00 because this ran.

⛔ Do not backfill either column with a guess. A plan that suddenly claims the
person chose Monday at 09:00 is a claim nobody made; the person opens the goal
and sets a schedule if they want one.

Idempotent — safe to run more than once. Run from `backend/`:

    python scripts/add_goal_schedule_columns.py
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
    "ALTER TABLE goal_activities "
    "ADD COLUMN IF NOT EXISTS days VARCHAR(80) NOT NULL DEFAULT ''",
    "ALTER TABLE goal_activities "
    "ADD COLUMN IF NOT EXISTS time_of_day VARCHAR(5)",
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
