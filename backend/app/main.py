from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, medications, symptoms

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

app.include_router(auth.router)
app.include_router(symptoms.router)
app.include_router(medications.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
