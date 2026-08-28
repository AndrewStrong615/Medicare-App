"""
Unit tests for app/core/security.py password hashing and JWT helpers.

These are pure functions (no DB), so no fixtures/overrides are needed.
"""

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_password_roundtrip_verifies():
    plain = "synthetic-test-password-1"

    hashed = hash_password(plain)

    assert hashed != plain
    assert verify_password(plain, hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct-password-1")

    assert verify_password("wrong-password-1", hashed) is False


def test_create_and_decode_access_token_roundtrip():
    token = create_access_token(subject="synthetic-user-id-123")

    subject = decode_access_token(token)

    assert subject == "synthetic-user-id-123"


def test_decode_access_token_invalid_token_returns_none():
    result = decode_access_token("not-a-real-jwt-token")

    assert result is None
