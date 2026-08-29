import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, intake, medications
from app.core.triage import credentials_available

app = FastAPI(
    title="MedHelp API",
    description=(
        "Informational-only backend. This API does not diagnose and does not "
        "recommend treatment. See CLAUDE.md for scope and data-handling rules."
    ),
    version="0.0.1",
)

# Dev-only: allows the Expo web app (served from a different port, so a
# different origin) to call this API from the browser. Tighten this to
# specific origins before any non-local deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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


app.include_router(auth.router)
app.include_router(intake.router)
app.include_router(medications.router)


@app.on_event("startup")
def warn_if_triage_unconfigured() -> None:
    """
    Say so at boot, not on the user's first attempt.

    Without credentials the intake endpoint correctly refuses to guess a tier,
    but the failure is silent until someone tries it — which is exactly how a
    misconfigured deployment goes unnoticed.
    """
    if not credentials_available():
        logging.getLogger(__name__).warning(
            "Symptom intake is DISABLED: no Anthropic credentials found. "
            "Emergency red-flag screening still works, but any other "
            "description will return 503. Set ANTHROPIC_API_KEY in "
            "backend/.env and restart."
        )


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        # Lets you check configuration without submitting a symptom
        # description. Reports only whether a credential source exists.
        "symptom_intake_configured": credentials_available(),
    }
