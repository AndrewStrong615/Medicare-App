"""
Shared pytest fixtures.

No live Postgres is available in this environment (or in CI-lite runs), so
DB-touching tests override `get_db` with a SQLite in-memory session for the
duration of the test. Schema is created fresh per test from the same
SQLAlchemy models used against real Postgres, so the tables/columns under
test match production shape; SQLite does diverge from Postgres on some
column-level behavior (e.g. strict typing, some constraint enforcement), so
these tests are not a substitute for running against real Postgres before
release.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Import models so their tables are registered on Base.metadata before
# create_all runs.
from app.models import medication_reminder, user  # noqa: F401


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
