"""
Tests for POST /auth/signup and POST /auth/login.

Uses the `client` fixture from conftest.py, which swaps in a SQLite
in-memory database for the test session — no live Postgres required. All
emails/passwords below are synthetic placeholders, not real credentials.
"""


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
