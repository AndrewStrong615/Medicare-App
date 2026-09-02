"""
Password hashing and access tokens.

Still scaffolding in the sense CLAUDE.md means — there is no refresh flow and
no server-side revocation — but the parts that exist are now hardened:

* **The algorithm is fixed in code, not read from the environment.** Reading it
  from config meant anything that could write the environment could set it to
  something else; `none` would have made every token forgeable. `HS256` is
  hard-coded on both the signing and the verifying side.
* **Issuer, audience and expiry are verified, not just present.** A token has
  to say it was minted by this API, for this app, and still be inside its
  lifetime. `iat` and `jti` are recorded so a revocation list has something to
  key on when one is built.
* **A malformed or hostile `sub` never reaches the database.** `decode` returns
  a subject only when it is a non-empty string.
* **Verifying a password takes the same work whether or not the account
  exists** — see `verify_password_for_missing_user`.

Before any real deployment: add refresh-token rotation and token revocation,
and keep JWT_SECRET_KEY out of source (config.py refuses to boot with the
published placeholder outside development).
"""

import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import (
    JWT_ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    settings,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Marks the token as an access token, so that if a refresh token is ever added
# it cannot be replayed against a route expecting this one.
ACCESS_TOKEN_TYPE = "access"

# A real bcrypt hash of a value nothing can supply, used only to burn the same
# CPU time on a login for an address that has no account. Without it, "no such
# user" returns in microseconds while a wrong password takes ~100ms, and the
# difference is a reliable oracle for which email addresses are registered —
# which for a health app is itself sensitive.
_DUMMY_PASSWORD_HASH = pwd_context.hash(f"no-such-account-{uuid.uuid4()}")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        # A stored hash that passlib cannot parse must fail closed, not 500.
        return False


def verify_password_for_missing_user(plain_password: str) -> bool:
    """
    Always False, but only after doing a real bcrypt verification.

    Call this on the "unknown email" branch of login so that branch costs the
    same as the "wrong password" branch. Always returns False.
    """
    pwd_context.verify(plain_password, _DUMMY_PASSWORD_HASH)
    return False


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "typ": ACCESS_TOKEN_TYPE,
        # Nothing reads this yet. It is here so that adding a revocation list
        # later does not require every already-issued token to be rejected.
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """
    The user id a token vouches for, or None if it does not vouch for one.

    None covers every failure the same way on purpose — bad signature, expired,
    wrong issuer, wrong audience, not an access token, no subject. The caller
    turns all of them into one 401, so nothing about which check failed is
    observable from outside.
    """
    if not isinstance(token, str) or not token.strip():
        return None

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            # A list of exactly one. Passing the token's own header algorithm
            # here is the classic algorithm-confusion bug.
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
            options={
                "require_exp": True,
                "require_iat": True,
                "require_sub": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_aud": True,
                "verify_iss": True,
                "verify_signature": True,
            },
        )
    except JWTError:
        return None

    if payload.get("typ") != ACCESS_TOKEN_TYPE:
        return None

    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.strip():
        return None

    return subject
