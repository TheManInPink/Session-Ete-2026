"""Schémas Pydantic v2 — contrats d'entrée/sortie des endpoints du service IA."""

from app.schemas.anomaly import AnomalyScoreRequest, AnomalyScoreResponse
from app.schemas.common import (
    CitizenPayload,
    Language,
    ParentInfo,
    Severity,
    Sex,
    Verdict,
)
from app.schemas.compare_names import CompareNamesRequest, CompareNamesResponse
from app.schemas.detect_errors import (
    DetectedError,
    DetectErrorsRequest,
    DetectErrorsResponse,
    Suggestion,
)
from app.schemas.duplicates import (
    DetectDuplicatesRequest,
    DetectDuplicatesResponse,
    DuplicateCandidate,
)
from app.schemas.health import HealthResponse
from app.schemas.ner import Entity, NerRequest, NerResponse
from app.schemas.ocr import OcrResponse, OcrStructuredFields

__all__ = [
    "AnomalyScoreRequest",
    "AnomalyScoreResponse",
    "CitizenPayload",
    "CompareNamesRequest",
    "CompareNamesResponse",
    "DetectDuplicatesRequest",
    "DetectDuplicatesResponse",
    "DetectErrorsRequest",
    "DetectErrorsResponse",
    "DetectedError",
    "DuplicateCandidate",
    "Entity",
    "HealthResponse",
    "Language",
    "NerRequest",
    "NerResponse",
    "OcrResponse",
    "OcrStructuredFields",
    "ParentInfo",
    "Severity",
    "Sex",
    "Suggestion",
    "Verdict",
]
