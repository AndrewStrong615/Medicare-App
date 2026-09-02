"""
Tests for the transport, token and configuration hardening.

Each test here corresponds to a specific way the API could be broken into, and
is written so that removing the fix fails the suite rather than quietly
restoring the hole. All emails and passwords are synthetic.
"""

import pytest
from pydantic import ValidationError

from app.core.config import (
    JWT_ALGORITHM,
    MIN_JWT_SECRET_LENGTH,
    PLACEHOLDER_JWT_SECRET,
    Settings,
)
from app.core.rate_limit import RateLimiter
from app.core.security import create_access_token, decode_access_token
from app.db.session import engine, require_tls


# --------------------------------------------------------------------------
# The signing key
# --------------------------------------------------------------------------


def test_placeholder_secret_refuses_to_boot_outside_development():
    """
    The published placeholder is not a secret — it is in this repository. A
    process that would accept tokens signed with it must not start.
    """
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            jwt_secret_key=PLACEHOLDER_JWT_SECRET,
            _env_file=None,
        )

    assert "JWT_SECRET_KEY" in str(exc.value)


def test_short_secret_refuses_to_boot_outside_development():
    with pytest.raises(ValidationError):
        Settings(
            environment="staging",
            jwt_secret_key="x" * (MIN_JWT_SECRET_LENGTH - 1),
            _env_file=None,
        )


def test_placeholder_secret_is_replaced_not_kept_in_development():
    """
    Development gets a warning, not a crash — but it never keeps the published
    value, so no running copy of this app trusts a key an attacker can read.
    """
    settings = Settings(
        environment="local", jwt_secret_key=PLACEHOLDER_JWT_SECRET, _env_file=None
    )

    assert settings.jwt_secret_key != PLACEHOLDER_JWT_SECRET
    assert len(settings.jwt_secret_key) >= MIN_JWT_SECRET_LENGTH


def test_two_development_processes_do_not_share_a_generated_secret():
    first = Settings(
        environment="local", jwt_secret_key=PLACEHOLDER_JWT_SECRET, _env_file=None
    )
    second = Settings(
        environment="local", jwt_secret_key=PLACEHOLDER_JWT_SECRET, _env_file=None
    )

    assert first.jwt_secret_key != second.jwt_secret_key


def test_a_real_secret_is_left_alone():
    secret = "a" * MIN_JWT_SECRET_LENGTH
    settings = Settings(
        environment="production", jwt_secret_key=secret, _env_file=None
    )

    assert settings.jwt_secret_key == secret


# --------------------------------------------------------------------------
# CORS
# --------------------------------------------------------------------------


def test_wildcard_cors_refused_outside_development():
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            jwt_secret_key="a" * MIN_JWT_SECRET_LENGTH,
            cors_allow_origins="*",
            _env_file=None,
        )

    assert "CORS_ALLOW_ORIGINS" in str(exc.value)


def test_cors_origins_parse_into_a_list_without_trailing_slashes():
    settings = Settings(
        environment="local",
        cors_allow_origins="https://a.example.com/, https://b.example.com",
        _env_file=None,
    )

    assert settings.cors_origin_list == [
        "https://a.example.com",
        "https://b.example.com",
    ]


def test_app_does_not_send_a_wildcard_cors_header(client):
    """
    `allow_origins=["*"]` let any page the user had open call this API. The
    response must now name an allowed origin, or none at all.
    """
    response = client.get(
        "/health", headers={"Origin": "https://evil.example.com"}
    )

    assert response.headers.get("access-control-allow-origin") != "*"


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------


def test_algorithm_is_fixed_at_hs256():
    """Not configurable, on purpose: an attacker-influenced `alg` is how token
    forgery starts, and `none` would make every token valid."""
    assert JWT_ALGORITHM == "HS256"
    assert not hasattr(Settings(_env_file=None), "jwt_algorithm")


def test_token_signed_with_another_key_is_rejected():
    from jose import jwt

    forged = jwt.encode(
        {
            "sub": "victim-user-id",
            "iss": "medhelp-api",
            "aud": "medhelp-app",
            "typ": "access",
            "exp": 9999999999,
            "iat": 1600000000,
        },
        PLACEHOLDER_JWT_SECRET,
        algorithm="HS256",
    )

    assert decode_access_token(forged) is None


def test_token_with_alg_none_is_rejected():
    """
    The unsigned-token attack, assembled by hand.

    `jose.jwt.encode` refuses to produce one, but an attacker is not using our
    library — they concatenate base64 themselves. `jwt.decode` is pinned to a
    one-element algorithm list, so a token whose header claims `alg: none`
    never gets its signature check skipped.
    """
    import base64
    import json

    def segment(data: dict) -> str:
        raw = json.dumps(data, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    unsigned = "{}.{}.".format(
        segment({"alg": "none", "typ": "JWT"}),
        segment(
            {
                "sub": "victim-user-id",
                "iss": "medhelp-api",
                "aud": "medhelp-app",
                "typ": "access",
                "exp": 9999999999,
                "iat": 1600000000,
            }
        ),
    )

    assert decode_access_token(unsigned) is None


def test_token_for_another_audience_is_rejected():
    from jose import jwt

    from app.core.config import settings

    wrong_audience = jwt.encode(
        {
            "sub": "user-id",
            "iss": "medhelp-api",
            "aud": "some-other-app",
            "typ": "access",
            "exp": 9999999999,
            "iat": 1600000000,
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )

    assert decode_access_token(wrong_audience) is None


def test_token_of_the_wrong_type_is_rejected():
    """A refresh token, if one is ever added, must not authenticate a request
    on its own."""
    from jose import jwt

    from app.core.config import settings

    refreshish = jwt.encode(
        {
            "sub": "user-id",
            "iss": "medhelp-api",
            "aud": "medhelp-app",
            "typ": "refresh",
            "exp": 9999999999,
            "iat": 1600000000,
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )

    assert decode_access_token(refreshish) is None


def test_expired_token_is_rejected():
    from jose import jwt

    from app.core.config import settings

    expired = jwt.encode(
        {
            "sub": "user-id",
            "iss": "medhelp-api",
            "aud": "medhelp-app",
            "typ": "access",
            "exp": 1600000000,
            "iat": 1599999000,
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )

    assert decode_access_token(expired) is None


def test_valid_token_still_round_trips():
    assert decode_access_token(create_access_token("synthetic-user-1")) == (
        "synthetic-user-1"
    )


def test_forged_token_cannot_read_another_users_medications(client, auth_headers):
    """
    The end-to-end version of the tests above: every per-user filter in the API
    trusts the signature, so a forgeable key would defeat all of them at once.
    """
    from jose import jwt

    owner = client.post(
        "/medications",
        json={"name": "Synthetic Tablet"},
        headers=auth_headers,
    )
    assert owner.status_code == 201

    forged = jwt.encode(
        {
            "sub": "any-user-id",
            "iss": "medhelp-api",
            "aud": "medhelp-app",
            "typ": "access",
            "exp": 9999999999,
            "iat": 1600000000,
        },
        PLACEHOLDER_JWT_SECRET,
        algorithm="HS256",
    )

    response = client.get(
        "/medications", headers={"Authorization": f"Bearer {forged}"}
    )

    assert response.status_code == 401


# --------------------------------------------------------------------------
# Sign-in abuse
# --------------------------------------------------------------------------


def test_repeated_failed_logins_are_rate_limited(client):
    from app.api.auth import login_limiter

    email = "brute.force.target@example.com"
    client.post("/auth/signup", json={"email": email, "password": "real-password-1"})

    statuses = [
        client.post(
            "/auth/login", json={"email": email, "password": f"guess-{n}-wrong"}
        ).status_code
        for n in range(login_limiter.max_attempts + 5)
    ]

    assert 429 in statuses, "unlimited password guessing is still possible"
    assert statuses[0] == 401, "the first attempt should be a normal rejection"


def test_rate_limited_response_says_when_to_retry(client):
    from app.api.auth import login_limiter

    for n in range(login_limiter.max_attempts + 2):
        response = client.post(
            "/auth/login",
            json={"email": "nobody@example.com", "password": f"guess-{n}-wrong"},
        )
        if response.status_code == 429:
            assert "Retry-After" in response.headers
            assert int(response.headers["Retry-After"]) >= 1
            return

    pytest.fail("the login limiter never fired")


def test_successful_login_clears_the_budget(client):
    """A user who mistypes a few times and then gets it right must not be left
    locked out for the rest of the window."""
    from app.api.auth import login_limiter

    email = "typo.prone@example.com"
    password = "correct-password-1"
    client.post("/auth/signup", json={"email": email, "password": password})

    for _ in range(login_limiter.max_attempts - 1):
        client.post("/auth/login", json={"email": email, "password": "wrong-one-1"})

    good = client.post("/auth/login", json={"email": email, "password": password})
    assert good.status_code == 200

    again = client.post("/auth/login", json={"email": email, "password": password})
    assert again.status_code == 200


def test_login_for_an_unknown_address_still_hashes_a_password(monkeypatch, client):
    """
    Identical wording is not enough: if the unknown-email branch skips bcrypt,
    response time answers "is this address registered?".
    """
    calls: list[str] = []
    import app.api.auth as auth_module

    real = auth_module.verify_password_for_missing_user

    def spy(password: str) -> bool:
        calls.append(password)
        return real(password)

    monkeypatch.setattr(auth_module, "verify_password_for_missing_user", spy)

    response = client.post(
        "/auth/login",
        json={"email": "never.registered@example.com", "password": "anything-1"},
    )

    assert response.status_code == 401
    assert calls, "the unknown-email branch returned without doing the work"


def test_rate_limiter_window_expires(monkeypatch):
    limiter = RateLimiter(max_attempts=2, window_seconds=60, name="test")

    clock = {"now": 1000.0}
    monkeypatch.setattr(
        "app.core.rate_limit.time.monotonic", lambda: clock["now"]
    )

    assert limiter.check("client") is None
    assert limiter.check("client") is None
    assert limiter.check("client") is not None

    clock["now"] += 61
    assert limiter.check("client") is None, "the window never reopened"


def test_rate_limiter_separates_clients():
    limiter = RateLimiter(max_attempts=1, window_seconds=60, name="test")

    assert limiter.check("10.0.0.1") is None
    assert limiter.check("10.0.0.2") is None, "one client's budget blocked another"
    assert limiter.check("10.0.0.1") is not None


# --------------------------------------------------------------------------
# Response headers
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "header,expected",
    [
        ("X-Content-Type-Options", "nosniff"),
        ("X-Frame-Options", "DENY"),
        ("Referrer-Policy", "no-referrer"),
        # Health data must not sit in a browser or proxy cache after the user
        # has closed the app.
        ("Cache-Control", "no-store"),
    ],
)
def test_security_headers_present(client, header, expected):
    response = client.get("/health")

    assert response.headers.get(header) == expected


def test_content_security_policy_locks_the_api_down(client):
    policy = client.get("/health").headers.get("Content-Security-Policy", "")

    assert "default-src 'none'" in policy
    assert "frame-ancestors 'none'" in policy


def test_hsts_not_sent_over_plain_http(client):
    """Pinning a host to https before a certificate exists locks you out of
    your own dev server, and the header is ignored over http anyway."""
    assert "Strict-Transport-Security" not in client.get("/health").headers


def test_hsts_sent_when_the_request_arrived_over_tls(client):
    response = client.get("/health", headers={"X-Forwarded-Proto": "https"})

    assert "max-age=" in response.headers.get("Strict-Transport-Security", "")


# --------------------------------------------------------------------------
# Request size
# --------------------------------------------------------------------------


def test_oversized_body_is_refused_before_it_is_parsed(client, auth_headers):
    from app.core.config import settings

    huge = "x" * (settings.max_request_body_bytes + 1024)

    response = client.post(
        "/intake/assess",
        json={"description": huge},
        headers=auth_headers,
    )

    assert response.status_code == 413


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------


def test_engine_hides_bound_parameters():
    """
    CLAUDE.md open finding: a 500 traceback wrote the symptom description to
    the log, because SQLAlchemy puts bound parameters into its exception text.
    """
    assert engine.hide_parameters is True


def test_tls_required_to_postgres_outside_development():
    url = require_tls(
        "postgresql://user:pw@db.example.com:5432/medhelp", is_development=False
    )

    assert "sslmode=require" in url


def test_existing_sslmode_is_not_overridden():
    url = "postgresql://user:pw@db.example.com:5432/medhelp?sslmode=verify-full"

    assert require_tls(url, is_development=False) == url


def test_local_development_url_is_left_alone():
    url = "postgresql://medhelp:medhelp@localhost:5432/medhelp_dev"

    assert require_tls(url, is_development=True) == url


def test_sqlite_url_is_left_alone():
    url = "sqlite:///:memory:"

    assert require_tls(url, is_development=False) == url


# --------------------------------------------------------------------------
# Every route is guarded
# --------------------------------------------------------------------------

# The only endpoints that may be reached without a token. Sign-up and sign-in
# have to be, and /health reports configuration state with no user data in it.
PUBLIC_ROUTES = {
    ("POST", "/auth/signup"),
    ("POST", "/auth/login"),
    ("GET", "/health"),
}


def test_every_other_route_requires_authentication():
    """
    A route added without `get_current_user` is a route that hands one user's
    health data to anyone who asks. This asserts the property over the whole
    app rather than trusting a reviewer to notice the missing dependency.
    """
    from app.core.dependencies import get_current_user
    from app.main import app

    unguarded: list[str] = []

    for route in app.routes:
        methods = getattr(route, "methods", set()) - {"HEAD", "OPTIONS"}
        path = getattr(route, "path", "")
        dependant = getattr(route, "dependant", None)
        if not methods or dependant is None:
            continue

        for method in methods:
            if (method, path) in PUBLIC_ROUTES:
                continue
            calls = {
                dependency.call for dependency in dependant.dependencies
            }
            if get_current_user not in calls:
                unguarded.append(f"{method} {path}")

    assert not unguarded, f"routes reachable without a token: {sorted(unguarded)}"
