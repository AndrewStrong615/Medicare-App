"""
Sign-up and sign-in.

Still a placeholder in the sense CLAUDE.md means — no refresh flow, no
lockout policy, no revocation — but the two things that made it *attackable*
rather than merely unfinished are fixed here:

* **Guessing is rate limited.** Both endpoints spend from a per-address budget
  (`app/core/rate_limit.py`), and a successful login clears it so an honest
  user who mistyped is not punished. Read that module for what the limit does
  and does not cover.
* **Login costs the same whether or not the account exists.** The old code
  returned immediately when the email was unknown and ran bcrypt when it was
  known, so response time answered "is this address registered?" reliably —
  the exact question the identical error message was written to avoid
  answering. `verify_password_for_missing_user` burns the same work.

Signup still tells the caller that an address is already registered, which is
user enumeration by design: without an email-verification flow, hiding it means
telling someone their account was created when it was not. That trade is
recorded as an open finding in CLAUDE.md rather than papered over here.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import RateLimiter, client_key, enforce
from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
    verify_password_for_missing_user,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

DUPLICATE_EMAIL_DETAIL = "Email already registered"

login_limiter = RateLimiter(
    max_attempts=settings.auth_rate_limit_attempts,
    window_seconds=settings.auth_rate_limit_window_seconds,
    name="auth.login",
)

signup_limiter = RateLimiter(
    max_attempts=settings.auth_rate_limit_attempts,
    window_seconds=settings.auth_rate_limit_window_seconds,
    name="auth.signup",
)


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(
    payload: UserCreate, request: Request, db: Session = Depends(get_db)
) -> User:
    enforce(signup_limiter, request)

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail=DUPLICATE_EMAIL_DETAIL)

    user = User(email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two concurrent signups for the same address can both pass the check
        # above; the unique index is the real guard. Report it as a duplicate
        # rather than letting it surface as a 500.
        db.rollback()
        raise HTTPException(status_code=400, detail=DUPLICATE_EMAIL_DETAIL)

    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    payload: UserLogin, request: Request, db: Session = Depends(get_db)
) -> Token:
    enforce(login_limiter, request)

    user = db.query(User).filter(User.email == payload.email).first()

    # Same message, and now the same amount of work, whether the email is
    # unknown or the password is wrong. Neither the body nor the timing
    # distinguishes them, so this endpoint cannot enumerate registered users.
    if user is None:
        verify_password_for_missing_user(payload.password)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Getting it right clears the budget, so a few typos on the way in do not
    # leave a real user locked out for the rest of the window.
    login_limiter.reset(client_key(request))

    token = create_access_token(subject=user.id)
    return Token(access_token=token)
