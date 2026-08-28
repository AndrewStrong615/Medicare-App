"""
Symptom lookup — stub only.

No clinical content lives here yet. When this is built out, every response
must carry the "consult a healthcare professional" disclaimer (see CLAUDE.md)
and must run through emergency-keyword detection before returning anything.
Route this file's changes through the compliance-reviewer subagent.
"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/symptoms", tags=["symptoms"])


@router.get("/search")
def search_symptoms(query: str) -> dict:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Symptom lookup is not implemented yet.",
    )
