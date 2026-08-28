from fastapi import FastAPI

from app.api import auth, medications, symptoms

app = FastAPI(
    title="MedHelp API",
    description=(
        "Informational-only backend. This API does not diagnose and does not "
        "recommend treatment. See CLAUDE.md for scope and data-handling rules."
    ),
    version="0.0.1",
)

app.include_router(auth.router)
app.include_router(symptoms.router)
app.include_router(medications.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
