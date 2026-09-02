"""
Database engine and per-request session.

Two settings here are data-handling controls, not tuning knobs:

**`hide_parameters=True`.** CLAUDE.md records an open finding: "A 500 traceback
writes the symptom description to the log." That is not a FastAPI problem — it
is SQLAlchemy, which by default puts the bound parameters of the failing
statement into the exception's own text. Starlette re-raises server errors so
the server can log them, so the traceback (and with it the description, the
follow-up answers, the medication name) reaches the application log on *any*
DB-level 500, whatever the route does. This flag replaces those values with a
placeholder at the source, which is the only place it can be fixed once and
cover every query.

**TLS to the database.** Health data in transit is covered by CLAUDE.md's "no
exceptions for internal traffic". Outside development, a Postgres URL that does
not say how it handles TLS gets `sslmode=require` appended rather than being
allowed to negotiate plaintext. Local development is left alone, because a
local Postgres normally has no certificate.
"""

from collections.abc import Generator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def require_tls(database_url: str, *, is_development: bool) -> str:
    """
    Add `sslmode=require` to a Postgres URL that does not already set it.

    Left alone in development, and for any non-Postgres URL (SQLite in tests
    has no transport to secure).
    """
    if is_development:
        return database_url

    parts = urlsplit(database_url)
    if not parts.scheme.startswith("postgres"):
        return database_url

    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "sslmode" in query or "ssl" in query:
        return database_url

    query["sslmode"] = "require"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


engine = create_engine(
    require_tls(settings.database_url, is_development=settings.is_development),
    # Keeps user health data out of exception text and SQL echo logs.
    hide_parameters=True,
    # A connection killed by an idle timeout should be replaced, not returned
    # to a request as an error.
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
