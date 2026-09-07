"""AI analysis router."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from dependencies import get_current_user
from models.ai import AnalysisResponse, AnalyzeRequest
from services import ai_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(body: AnalyzeRequest, current_user=Depends(get_current_user)):
    """Return AI analysis for an incident — uses cache when available.
    
    Cache is skipped when the request includes a user_question so that
    every distinct question gets a fresh LLM response instead of the
    cached generic incident diagnosis.
    """
    has_user_question = bool(getattr(body, "user_question", None))

    # Only use cache for automated/generic diagnoses (no free-form question)
    if body.incident_id and not has_user_question:
        cached = await ai_service.get_cached(body.incident_id)
        if cached:
            return AnalysisResponse(
                explanation=cached.get("explanation", ""),
                confidence=cached.get("confidence", 0),
                causes=cached.get("causes", []),
                steps=cached.get("steps", []),
            )

    context = body.model_dump()
    result = await ai_service.analyze_incident(context)

    # Only cache generic (no user_question) analyses to avoid poisoning the
    # cache with question-specific answers
    if body.incident_id and not has_user_question:
        await ai_service.cache(body.incident_id, result)

    return AnalysisResponse(**result)


@router.get("/analyze/{incident_id}", response_model=AnalysisResponse)
async def get_analysis(incident_id: str, current_user=Depends(get_current_user)):
    """Return cached analysis for an incident, or 404 if not yet analysed."""
    cached = await ai_service.get_cached(incident_id)
    if not cached:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No analysis found for this incident")
    return AnalysisResponse(
        explanation=cached.get("explanation", ""),
        confidence=cached.get("confidence", 0),
        causes=cached.get("causes", []),
        steps=cached.get("steps", []),
    )
