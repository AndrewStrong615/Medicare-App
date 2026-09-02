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

from app.api.auth import login_limiter, signup_limiter
from app.db.base import Base
from app.db.session import get_db
from app.main import app

# Import models so their tables are registered on Base.metadata before
# create_all runs.
from app.models import (  # noqa: F401
    appointment,
    intake,
    medication,
    provider_location,
    reminder,
    user,
)


@pytest.fixture(autouse=True)
def _no_live_geocoding(monkeypatch):
    """
    No test may reach the Census geocoder over the network.

    Provider distances are geocoded from real street addresses
    (`app/services/provider_geo.py`), so without this fixture any test that
    calls /providers/search would make a live third-party request - slow,
    flaky, and dependent on someone else's uptime.

    The default answer is an empty dict, which means "the service answered for
    nothing". That exercises the fallback path: distances drop back to the
    ZIP-centroid estimate and nothing is written to the cache. Tests that want
    real coordinates patch `geocode_addresses` themselves.
    """
    import app.services.provider_geo as provider_geo

    monkeypatch.setattr(provider_geo, "geocode_addresses", lambda entries: {})


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """
    Give every test a fresh sign-in budget.

    The auth rate limiter keys on the client address, and every test in the
    suite shares one — `TestClient` always reports the same host. Without this
    the limiter would count the whole suite as a single attacker and tests
    would start failing at whichever one happened to run eleventh. Tests that
    are *about* the limiter drive it deliberately; see test_rate_limit.py.
    """
    login_limiter.clear()
    signup_limiter.clear()
    yield
    login_limiter.clear()
    signup_limiter.clear()


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


def _register(client, email: str, password: str = "synthetic-password-1") -> str:
    """Create a synthetic account and return its bearer token."""
    signup = client.post("/auth/signup", json={"email": email, "password": password})
    assert signup.status_code == 201, signup.text
    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


@pytest.fixture()
def auth_headers(client):
    """Bearer headers for a synthetic signed-in user."""
    token = _register(client, "list.owner@example.com")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def other_user_headers(client):
    """
    A second signed-in user, for proving one account cannot read another's
    medication data.
    """
    token = _register(client, "other.person@example.com")
    return {"Authorization": f"Bearer {token}"}
