"""
Create any tables that do not exist yet in the configured database.

WHY THIS EXISTS RATHER THAN A MIGRATION: CLAUDE.md names Alembic as the
migration tool, but it is still not wired up — the same gap that
`add_intake_audit_columns.py` works around. Nothing in the app calls
`create_all` at startup, so a new model (such as `appointments`) has no table
until someone makes one.

`create_all` creates missing tables and **never alters existing ones**. That
makes it safe to re-run, and useless for a column added to a table that already
exists — for that, see `add_intake_audit_columns.py`.

Run from `backend/`:

    python scripts/create_missing_tables.py

This is a development convenience, not a release process. Set Alembic up before
anything real runs.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402

# Importing the models is what registers their tables on Base.metadata. Without
# this the script would cheerfully create nothing at all.
from app.models import (  # noqa: F401,E402
    appointment,
    intake,
    medication,
    provider_location,
    reminder,
    user,
)


def main() -> int:
    inspector = inspect(engine)
    before = set(inspector.get_table_names())

    Base.metadata.create_all(bind=engine)

    after = set(inspect(engine).get_table_names())
    created = sorted(after - before)

    if created:
        print("Created: " + ", ".join(created))
    else:
        print("Nothing to create; every table already exists.")

    print("Present: " + ", ".join(sorted(after)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
