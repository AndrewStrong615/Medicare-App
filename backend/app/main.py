import logging
import re

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import appointments, auth, intake, medications, providers, reminders
from app.core.config import settings
from app.core.triage import credentials_available

logger = logging.getLogger(__name__)

# Loopback, private (RFC1918), link-local and CGNAT/WireGuard-mesh origins, on
# any port. Mirrors the transport rule the mobile client applies in
# `mobile/src/services/baseUrl.ts` — keep the two in step.
_PRIVATE_ORIGIN_RE = re.compile(
    r"^https?://("
    r"localhost|"
    r"[a-z0-9-]+\.local|"
    r"127(\.\d{1,3}){3}|"
    r"10(\.\d{1,3}){3}|"
    r"172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|"
    r"192\.168(\.\d{1,3}){2}|"
    r"169\.254(\.\d{1,3}){2}|"
    r"100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])(\.\d{1,3}){2}|"
    r"\[::1\]"
    r")(:\d{1,5})?$",
    re.IGNORECASE,
)

# Paths that serve HTML/JS and therefore cannot take the API's locked-down
# content-security policy. Served only while `enable_api_docs` is on.
_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}

_docs_enabled = settings.enable_api_docs and settings.is_development

app = FastAPI(
    title="MedHelp API",
    description=(
        "Informational-only backend. This API does not diagnose and does not "
        "recommend treatment. See CLAUDE.md for scope and data-handling rules."
    ),
    version="0.0.1",
    # An unauthenticated, machine-readable map of every route and every field
    # is free reconnaissance. This API has no public consumers, so the schema
    # is served only where a developer is the one reading it.
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """
    Headers every response carries, and why each one is here.

    * `Cache-Control: no-store` — the responses of this API are one person's
      medications, appointments and symptom assessments. A browser disk cache
      or an intermediary that keeps a copy is a place that health data leaks
      from later, on a shared machine or a stolen laptop.
    * `Strict-Transport-Security` — only when the request already arrived over
      TLS. Sent on a plain-http response it would be ignored by the browser
      anyway, and pinning a host to https before a certificate exists locks
      you out of your own dev server.
    * `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors`,
      `Referrer-Policy`, `Cross-Origin-*` — the standard set that stops a JSON
      response being sniffed as HTML, the API being framed for clickjacking,
      and URLs being leaked onward in a Referer header.
    * `Content-Security-Policy: default-src 'none'` — an API returns JSON and
      should never load or execute anything. Skipped for the docs pages, which
      are real HTML and do.

    ⛔ `Permissions-Policy` and the CSP are correct *for an API*. If this app
    is ever changed to serve the Expo web build from FastAPI as well, both have
    to be relaxed for that route: `geolocation=()` would switch off the "Use my
    location" button, and `default-src 'none'` would stop the bundle loading at
    all. Today nothing here serves HTML except the docs pages.
    """
    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(), camera=(), microphone=()"
    )
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("Pragma", "no-cache")

    if request.url.path not in _DOCS_PATHS:
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; "
            "form-action 'none'",
        )

    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    if request.url.scheme == "https" or forwarded_proto == "https":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )

    return response


@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    """
    Refuse an oversized body before anything buffers it.

    The pydantic schemas cap individual fields, but that check runs *after* the
    whole body has been read into memory. A declared Content-Length above the
    cap is rejected at the door.
    """
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > settings.max_request_body_bytes:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": "Request body is too large."},
                )
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "Malformed Content-Length header."},
            )

    return await call_next(request)


# Explicit allowlist. This was `allow_origins=["*"]`, which let any page the
# user happened to have open call this API from their browser.
#
# `allow_credentials` stays off: the app authenticates with a bearer token it
# holds in memory, not a cookie, so nothing needs credentialed cross-origin
# requests — and turning it on is what makes a permissive origin rule
# genuinely dangerous.
_cors_kwargs: dict = {
    "allow_origins": settings.cors_origin_list,
    "allow_credentials": False,
    "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type"],
    "max_age": 600,
}

if settings.is_development and settings.cors_allow_private_origins:
    # Development only: also accept any loopback/LAN/mesh origin, so serving
    # the web build at http://192.168.1.5:8081 works without editing .env
    # every time the network changes. Never applied outside development —
    # `Settings` refuses to start there with a wildcard, and this regex is not
    # reachable in that case.
    _cors_kwargs["allow_origin_regex"] = _PRIVATE_ORIGIN_RE.pattern

app.add_middleware(CORSMiddleware, **_cors_kwargs)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Return validation errors without echoing what the user submitted.

    Pydantic includes the rejected value under `input`, so by default a
    too-short password or a symptom-search string comes back in the response
    body — and from there into client logs, proxies, and crash reporters.
    The field name and the reason are enough for the user to fix the problem.
    """
    safe_errors = [
        {
            "type": error.get("type"),
            "loc": error.get("loc"),
            "msg": error.get("msg"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": safe_errors},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    One fixed sentence for any unhandled failure.

    The response body must not carry the exception's text. A SQLAlchemy error
    names the table, the columns and — unless `hide_parameters` is set, which
    `app/db/session.py` does — the bound values, which for this app means a
    symptom description or a medication name. Nothing about the failure that
    is useful to an attacker, or sensitive to the user, crosses the wire.

    The traceback is still logged: Starlette re-raises after this runs, so the
    server records it. That is why the parameter-hiding in `db/session.py` is
    the load-bearing half of this pair, not this handler.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Something went wrong. Please try again."},
    )


app.include_router(auth.router)
app.include_router(intake.router)
app.include_router(medications.router)
app.include_router(providers.router)
app.include_router(reminders.router)
app.include_router(appointments.router)


@app.on_event("startup")
def warn_if_triage_unconfigured() -> None:
    """
    Say so at boot, not once someone is already looking at a vague answer.

    Without credentials intake still works — the rule layer is the product and
    needs no key — but it is running on one of two layers, and the difference
    is invisible from the outside. That is exactly how a misconfigured
    deployment goes unnoticed.

    This message used to say the endpoint returned 503 for anything that was
    not an emergency. That was true of an earlier design, in which the model
    was the classifier; it has not been true since the rule layer became the
    thing that always runs. It sent an operator looking for an outage when
    what they had was a quality problem.
    """
    if not credentials_available():
        logging.getLogger(__name__).warning(
            "Symptom intake is running RULES-ONLY: no Anthropic credentials "
            "found. Every description still gets a tier, and red-flag "
            "screening is unaffected — but the explanation shown to the user "
            "is one of a few fixed sentences rather than one written to what "
            "they typed, and the classifier can never ask a clarifying "
            "question. Set ANTHROPIC_API_KEY in backend/.env and restart."
        )


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        # Lets you check configuration without submitting a symptom
        # description. Reports only whether a credential source exists.
        "symptom_intake_configured": credentials_available(),
    }
