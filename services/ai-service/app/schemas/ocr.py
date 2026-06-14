"""ocr.py — Schémas de l'endpoint POST /api/v1/ai/ocr-extract."""

from __future__ import annotations

from pydantic import BaseModel, Field


class OcrStructuredFields(BaseModel):
    """Champs structurés extraits d'un acte de naissance scanné."""

    name: str | None = Field(default=None, description="Nom complet détecté")
    first_name: str | None = None
    last_name: str | None = None
    birth_date: str | None = Field(default=None, description="Date de naissance détectée (texte)")
    birth_place: str | None = None
    father_name: str | None = None
    mother_name: str | None = None


class OcrResponse(BaseModel):
    """Résultat de la numérisation d'un acte de naissance."""

    extracted_text: str = Field(description="Texte brut reconnu par l'OCR")
    structured_fields: OcrStructuredFields
    confidence: float = Field(ge=0.0, le=1.0, description="Confiance moyenne de l'OCR (0-1)")
    engine: str = Field(description="Moteur OCR utilisé (tesseract | easyocr)")
