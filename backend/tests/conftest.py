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
    goal,
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
def _no_live_model(monkeypatch):
    """
    No test may reach a live model, free or paid.

    The same rule as `_no_live_geocoding` above, and it exists because the
    suite broke it: putting a working `LLM_BASE_URL` in `backend/.env` — the
    documented way to switch the model layer on — made unstubbed tests call
    that endpoint for real. Against a local model that turned an 85-second run
    into minutes; against a hosted one it would have been someone's money and
    someone's rate limit, and the descriptions in these tests would have left
    the machine.

    The paid path was exposed the same way the whole time: `credentials_
    available()` also honours `ANTHROPIC_AUTH_TOKEN` and a stored CLI login
    profile, so a developer signed in locally was one unstubbed test away from
    live billed calls.

    Two things are neutralised, because there are two ways to reach a model:

    * the endpoint settings, so `llm.configured()` is False and `llm.chat`
      refuses before it opens a socket;
    * `_build_client`, which is where the Anthropic SDK resolves credentials
      from the environment and a profile on disk — neither of which a setting
      can clear.

    `_build_client` is the right seam rather than `_classify_with_anthropic`,
    and the difference matters: stubbing the whole classifier would have left
    the response-handling tests in test_triage.py passing without running the
    code they exist to cover, because they assert a raise and
    TriageNotConfigured is a TriageUnavailable. Blocking only the client keeps
    that parsing live while still opening no socket.

    Tests that want a model layer set it up themselves — `stub_triage` here,
    `script` and `endpoint_configured` in test_deduction.py, and the
    `_build_client` / `_classify_with_model` patches in test_triage.py — and
    every one of those runs after this fixture, so opting in still works.
    """
    from app.core import triage
    from app.core.config import settings

    monkeypatch.setattr(settings, "llm_base_url", "")
    monkeypatch.setattr(settings, "llm_model", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "")

    def _refuse():
        raise triage.TriageNotConfigured("No live model client is available in tests.")

    monkeypatch.setattr(triage, "_build_client", _refuse)


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
