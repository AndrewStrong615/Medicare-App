"""
Placeholder auth endpoints. Real password/token lifecycle rules (rotation,
lockout, revocation) are not implemented yet — see CLAUDE.md "Known Gaps".
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

DUPLICATE_EMAIL_DETAIL = "Email already registered"


@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def signup(payload: UserCreate, db: Session = Depends(get_db)) -> User:
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
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.email == payload.email).first()
    # The same message is returned whether the email is unknown or the password
    # is wrong, so this endpoint cannot be used to enumerate registered users.
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(subject=user.id)
    return Token(access_token=token)
