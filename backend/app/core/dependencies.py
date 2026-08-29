"""
Shared request dependencies.

`get_current_user` is the guard for every route that touches a user's own
health data. Until this existed, `decode_access_token` was dead code and
`/medications/reminders` returned every row in the table to any caller — the
exact shape of a PHI leak, flagged in two compliance reviews.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

# auto_error=False so a missing header produces our own 401 with a consistent
# body, rather than FastAPI's 403.
_bearer = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sign in to continue.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise CREDENTIALS_ERROR

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        # A validly-signed token for a deleted account must not authenticate.
        raise CREDENTIALS_ERROR

    return user
