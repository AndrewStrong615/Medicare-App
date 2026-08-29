"""
Tests for POST /auth/signup and POST /auth/login.

Uses the `client` fixture from conftest.py, which swaps in a SQLite
in-memory database for the test session — no live Postgres required. All
emails/passwords below are synthetic placeholders, not real credentials.
"""


DUPLICATE_DETAIL = "already registered"


def _signup(client, email="jordan.tester@example.com", password="s3cret-pw!"):
    return client.post("/auth/signup", json={"email": email, "password": password})


def test_signup_success(client):
    response = _signup(client, email="new.patient@example.com", password="correct-horse-1")

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.patient@example.com"
    assert "id" in body
    # Password/hash must never be echoed back to the client.
    assert "password" not in body
    assert "hashed_password" not in body


def test_signup_duplicate_email_rejected(client):
    email = "duplicate.user@example.com"
    first = _signup(client, email=email, password="first-password-1")
    assert first.status_code == 201

    second = _signup(client, email=email, password="different-password-2")

    assert second.status_code == 400
    assert "already registered" in second.json()["detail"].lower()


def test_login_success(client):
    email = "login.success@example.com"
    password = "correct-password-99"
    _signup(client, email=email, password=password)

    response = client.post("/auth/login", json={"email": email, "password": password})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and body["access_token"]


def test_login_wrong_password_rejected(client):
    email = "login.wrongpw@example.com"
    _signup(client, email=email, password="the-real-password-1")

    response = client.post(
        "/auth/login", json={"email": email, "password": "totally-wrong-password"}
    )

    assert response.status_code == 401
    assert "invalid" in response.json()["detail"].lower()


def test_login_unknown_email_rejected(client):
    response = client.post(
        "/auth/login",
        json={"email": "nobody.registered@example.com", "password": "whatever-1"},
    )

    assert response.status_code == 401


def test_signup_rejects_short_password(client):
    response = _signup(client, email="short.pw@example.com", password="abc123")

    assert response.status_code == 422


def test_signup_rejects_password_over_bcrypt_limit(client):
    # bcrypt only hashes the first 72 bytes. Accepting a longer password would
    # mean any string sharing its first 72 bytes could log the account in.
    response = _signup(client, email="long.pw@example.com", password="a" * 73)

    assert response.status_code == 422


def test_signup_accepts_password_at_bcrypt_limit(client):
    response = _signup(client, email="exact.pw@example.com", password="a" * 72)

    assert response.status_code == 201


def test_email_casing_does_not_create_a_second_account(client):
    first = _signup(client, email="CaseUser@Example.com", password="shared-password-1")
    assert first.status_code == 201
    assert first.json()["email"] == "caseuser@example.com"

    second = _signup(client, email="caseuser@example.com", password="other-password-2")

    assert second.status_code == 400
    assert DUPLICATE_DETAIL in second.json()["detail"].lower()


def test_login_is_case_insensitive_for_email(client):
    _signup(client, email="MixedCase@Example.com", password="valid-password-1")

    response = client.post(
        "/auth/login",
        json={"email": "mixedcase@example.com", "password": "valid-password-1"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_tolerates_surrounding_whitespace_in_email(client):
    # Mobile keyboards and autofill frequently append a trailing space.
    _signup(client, email="spaced.user@example.com", password="valid-password-1")

    response = client.post(
        "/auth/login",
        json={"email": "  spaced.user@example.com  ", "password": "valid-password-1"},
    )

    assert response.status_code == 200
