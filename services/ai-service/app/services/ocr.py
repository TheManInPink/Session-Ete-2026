"""
ocr.py — Extraction OCR d'un acte de naissance scanné.

Pipeline : image → Tesseract (texte + confiance) → post-traitement NER/regex
(structuration des champs nom/date/parents/lieu).

Dépendances **optionnelles** : `pytesseract` (+ binaire Tesseract système) et
`Pillow`. Si elles sont absentes, :func:`extract_from_image` lève
:class:`OcrUnavailableError`, que le routeur traduit en HTTP 503 — le reste du
service continue de fonctionner.

Stack cible (doc 11) : Tesseract + post-traitement spaCy NER. EasyOCR est une
alternative possible (non incluse par défaut pour limiter la taille de l'image).
"""

from __future__ import annotations

import io
import logging
import re

from app.schemas.ocr import OcrResponse, OcrStructuredFields
from app.services.ner import extract_entities

logger = logging.getLogger("nina_aes.ai.ocr")


class OcrUnavailableError(RuntimeError):
    """Levée quand l'OCR n'est pas disponible (Tesseract/Pillow absents)."""


# Garde-fou anti-« decompression bomb » : refuser les images démesurées.
_MAX_IMAGE_PIXELS = 40_000_000  # ~40 mégapixels


def _load_backends():
    """Importe pytesseract + PIL ; lève OcrUnavailableError si indisponibles."""
    try:
        import pytesseract  # pyright: ignore[reportMissingImports]  # extra `ocr`
        from PIL import Image  # pyright: ignore[reportMissingImports]  # extra `ocr`

        # Borne le nombre de pixels décodés (atténue les bombes de décompression).
        Image.MAX_IMAGE_PIXELS = _MAX_IMAGE_PIXELS
        return pytesseract, Image
    except Exception as exc:  # noqa: BLE001 - dépendances système optionnelles
        raise OcrUnavailableError(
            "OCR indisponible : installer Tesseract + pytesseract + Pillow (extra `ocr`)."
        ) from exc


def ocr_available() -> bool:
    """Indique si l'OCR est disponible (imports pytesseract + Pillow), sans lever.

    Probe léger pour /health : ne vérifie pas le binaire Tesseract système (testé
    à la première requête, qui renvoie 503 le cas échéant).
    """
    try:
        _load_backends()
        return True
    except OcrUnavailableError:
        return False


def _structure_fields(text: str) -> OcrStructuredFields:
    """Déduit des champs structurés depuis le texte OCR brut (heuristique)."""
    entities, _ = extract_entities(text, "fr")
    persons = [e.text for e in entities if e.label == "PER"]
    dates = [e.text for e in entities if e.label == "DATE"]
    places = [e.text for e in entities if e.label == "LOC"]

    father = _find_after(text, r"p[èe]re")
    mother = _find_after(text, r"m[èe]re")

    name = persons[0] if persons else None
    first_name = last_name = None
    if name and " " in name:
        first_name, last_name = name.split(" ", 1)

    return OcrStructuredFields(
        name=name,
        first_name=first_name,
        last_name=last_name,
        birth_date=dates[0] if dates else None,
        birth_place=places[0] if places else None,
        father_name=father,
        mother_name=mother,
    )


def _find_after(text: str, label_pattern: str) -> str | None:
    """Cherche un nom propre suivant un libellé (« père : Modibo Traoré »)."""
    match = re.search(
        rf"{label_pattern}\s*:?\s*([A-ZÀ-Ý][\wÀ-ÿ'’\-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'’\-]+){{0,3}})",
        text,
        re.IGNORECASE,
    )
    return match.group(1).strip() if match else None


def extract_from_image(image_bytes: bytes, languages: str = "fra+eng") -> OcrResponse:
    """Effectue l'OCR d'une image d'acte de naissance.

    Args:
        image_bytes: contenu binaire de l'image (PNG/JPEG/TIFF).
        languages: langues Tesseract (ex. « fra+eng »).

    Returns:
        :class:`OcrResponse` (texte brut, champs structurés, confiance).

    Raises:
        OcrUnavailableError: si Tesseract/Pillow ne sont pas installés.
        ValueError: si l'image est illisible.
    """
    pytesseract, image_module = _load_backends()

    try:
        image = image_module.open(io.BytesIO(image_bytes))
        image.load()
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Image illisible ou format non supporté.") from exc

    # Le binaire Tesseract système peut être absent même si pytesseract est
    # installé → on le traduit en OcrUnavailableError (503), pas en 500.
    try:
        text = pytesseract.image_to_string(image, lang=languages)
    except (pytesseract.TesseractNotFoundError, pytesseract.TesseractError) as exc:
        raise OcrUnavailableError(
            "Binaire Tesseract introuvable ou en échec sur le serveur."
        ) from exc

    # Confiance moyenne à partir des données par mot (conf < 0 = ignoré).
    confidence = 0.0
    try:
        data = pytesseract.image_to_data(image, lang=languages, output_type=pytesseract.Output.DICT)
        confs = [
            int(c) for c in data.get("conf", []) if str(c).lstrip("-").isdigit() and int(c) >= 0
        ]
        if confs:
            confidence = round(sum(confs) / len(confs) / 100.0, 3)
    except Exception as exc:  # noqa: BLE001 - la confiance est best-effort
        logger.debug("Confiance OCR indisponible : %s", exc)

    return OcrResponse(
        extracted_text=text.strip(),
        structured_fields=_structure_fields(text),
        confidence=confidence,
        engine="tesseract",
    )
