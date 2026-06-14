"""routers/ocr_extract.py — POST /api/v1/ai/ocr-extract (multipart)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.auth import require_roles
from app.config import settings
from app.schemas.ocr import OcrResponse
from app.services.ocr import OcrUnavailableError, extract_from_image

router = APIRouter(tags=["ocr"])


@router.post(
    "/ocr-extract",
    response_model=OcrResponse,
    summary="OCR d'un acte de naissance scanné (texte + champs structurés)",
)
async def ocr_extract(
    file: UploadFile = File(..., description="Image de l'acte (PNG/JPEG/TIFF)"),
    _ctx=Depends(require_roles("AGENT", "ADMIN", "SYSTEM")),
) -> OcrResponse:
    """Numérise un acte de naissance et structure les champs détectés.

    Returns:
        Texte brut, champs structurés (nom, date, parents, lieu), confiance.

    Raises:
        HTTPException 413: si l'image dépasse la taille maximale.
        HTTPException 415: si le fichier n'est pas une image.
        HTTPException 503: si l'OCR (Tesseract) n'est pas disponible.
    """
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Le fichier doit être une image.",
        )

    # Lecture bornée : on accumule par blocs et on abandonne dès que la taille
    # max est dépassée — l'intégralité du corps n'est jamais bufferisée (anti-DoS
    # mémoire). Le content-type n'est qu'un indice ; la validation réelle est le
    # décodage Pillow en aval.
    max_bytes = settings.ocr_max_upload_bytes
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(64 * 1024):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Image trop volumineuse (max {max_bytes} octets).",
            )
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fichier vide.")

    try:
        return extract_from_image(content, settings.ocr_languages)
    except OcrUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
