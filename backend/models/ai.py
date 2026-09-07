"""Pydantic models for AI analysis resources."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class AnalyzeRequest(BaseModel):
    incident_id: Optional[str] = None
    user_question: Optional[str] = None
    title: str = "General Query"
    description: Optional[str] = None
    error_message: Optional[str] = None
    logs: Optional[List[str]] = None
    provider: Optional[str] = None
    query: Optional[str] = None
    deployment_status: Optional[str] = None
    deployment_version: Optional[str] = None
    incident_severity: Optional[str] = None
    incident_status: Optional[str] = None

    model_config = {"extra": "allow"}


class AnalysisResponse(BaseModel):
    explanation: str
    confidence: int
    causes: List[str] = []
    steps: List[Dict[str, Any]] = []
