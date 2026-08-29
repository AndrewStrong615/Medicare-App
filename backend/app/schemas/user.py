from pydantic import BaseModel, EmailStr, field_validator

# bcrypt hashes only the first 72 bytes of a password and silently ignores the
# rest, so a longer password would authenticate against any prefix-sharing
# variant. Reject those explicitly rather than accepting a password we cannot
# fully honour.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _validate_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(
            f"Password must be at most {MAX_PASSWORD_BYTES} bytes long."
        )
    return value


class UserCreate(BaseModel):
    email: EmailStr
    password: str

    _normalize = field_validator("email")(_normalize_email)
    _check_password = field_validator("password")(_validate_password)


class UserLogin(BaseModel):
    email: EmailStr
    password: str

    # Login normalizes the email the same way signup does so that an account
    # created as "User@example.com" is reachable by typing "user@example.com".
    # Password rules are deliberately NOT applied here: they can change over
    # time, and existing accounts must stay able to log in.
    _normalize = field_validator("email")(_normalize_email)


class UserOut(BaseModel):
    id: str
    email: EmailStr

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
