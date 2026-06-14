"""
detector.py — Étape ③ du pipeline : analyse et détection d'anomalies.

Moteur de règles métier qui inspecte un :class:`NormalizedRecord` et produit :
    - une liste d'erreurs détectées (:class:`DetectedError`) ;
    - une liste de propositions de correction (:class:`Suggestion`).

Règles implémentées (cf. PROMPT 4.1 / doc 11) :
    1. Format NINA invalide (regex) + lettre de contrôle erronée.
    2. Date de naissance dans le futur, avant 1900, ou format corrompu.
    3. Sexe encodé dans le NINA incohérent avec le champ `sex`.
    4. Année/mois du NINA incohérents avec `birth_date`.
    5. Code région du NINA invalide ou incohérent avec `birth_place`.
    6. Inversion nom/prénom, ou prénom citoyen = nom d'un parent.
    7. Fautes d'orthographe (fuzzy matching contre les listes de référence).
    8. Caractères suspects (chiffres dans un nom, lettres dans une date).

Le détecteur n'applique JAMAIS de correction : il propose. La décision revient
à l'agent humain (doc 11 §2.3).
"""

from __future__ import annotations

from datetime import date

from app.schemas.common import Severity
from app.schemas.detect_errors import DetectedError, Suggestion
from app.services import nina_rules
from app.services.comparator import best_match, compare_names
from app.services.normalizer import NormalizedRecord
from app.services.reference import (
    all_common_first_names,
    all_common_last_names,
    is_common_first_name,
    is_common_last_name,
    language_plausible,
    region_name_for_digit,
)

# Seuils de fuzzy matching pour la détection orthographique.
_SPELLING_LOWER = 78.0  # en dessous : trop différent, on ne propose rien
_SPELLING_UPPER = 99.5  # au dessus : considéré identique (déjà correct)
_INVERSION_THRESHOLD = 90.0


def detect(record: NormalizedRecord) -> tuple[list[DetectedError], list[Suggestion]]:
    """Analyse un enregistrement normalisé et renvoie erreurs + suggestions.

    Args:
        record: enregistrement issu de l'étape de normalisation.

    Returns:
        Tuple ``(errors, suggestions)``.
    """
    errors: list[DetectedError] = []
    suggestions: list[Suggestion] = []

    _check_nina(record, errors, suggestions)
    _check_birth_date(record, errors)
    _check_suspicious_chars(record, errors)
    _check_name_inversion(record, errors)
    _check_spelling(record, errors, suggestions)
    _check_language(record, errors)

    return errors, suggestions


# ─── Règles 1, 3, 4, 5 — cohérence du NINA ──────────────────────────
def _check_nina(
    record: NormalizedRecord,
    errors: list[DetectedError],
    suggestions: list[Suggestion],
) -> None:
    """Vérifie le format, la lettre de contrôle et les champs encodés du NINA."""
    nina = record.nina

    if not nina_rules.NINA_REGEX.match(nina):
        errors.append(
            DetectedError(
                type="nina_format_invalid",
                field="nina",
                severity=Severity.HIGH,
                message="Le NINA ne respecte pas le format attendu (14 chiffres + 1 lettre, "
                "1er chiffre = sexe 1 ou 2).",
                confidence=1.0,
                details={"length": len(nina)},
            )
        )
        return  # impossible d'aller plus loin sans format valide

    parsed = nina_rules.parse_nina(nina)

    # Règle 1b — lettre de contrôle
    expected_letter = nina_rules.compute_control_letter(nina[:14])
    if parsed.lettre_controle != expected_letter:
        errors.append(
            DetectedError(
                type="nina_checksum_invalid",
                field="nina",
                severity=Severity.HIGH,
                message="La lettre de contrôle du NINA est incorrecte.",
                confidence=1.0,
                details={"expected": expected_letter, "found": parsed.lettre_controle},
            )
        )
        suggestions.append(
            Suggestion(
                field="nina",
                current_value=nina_rules.mask_nina(nina),
                proposed_value=nina_rules.mask_nina(nina[:14] + expected_letter),
                confidence=0.95,
                reason="Lettre de contrôle recalculée à partir des 14 chiffres.",
            )
        )

    # Règle 3 — cohérence sexe
    nina_sex = nina_rules.SEX_BY_NINA_DIGIT.get(nina[0])
    if nina_sex and record.sex in {"M", "F"} and nina_sex != record.sex:
        errors.append(
            DetectedError(
                type="sex_nina_mismatch",
                field="sex",
                severity=Severity.HIGH,
                message=f"Le sexe encodé dans le NINA ({nina_sex}) diffère du champ sexe "
                f"({record.sex}).",
                confidence=0.9,
                details={"nina_sex": nina_sex, "declared_sex": record.sex},
            )
        )

    # Règles 4 — cohérence année/mois (uniquement si la date est exploitable)
    if record.birth_date is not None:
        _check_nina_date_consistency(record, parsed, errors)

    # Règle 5 — cohérence géographique
    _check_nina_geo(record, parsed, errors)


def _check_nina_date_consistency(
    record: NormalizedRecord,
    parsed: nina_rules.ParsedNina,
    errors: list[DetectedError],
) -> None:
    """Compare l'année/mois encodés dans le NINA à la date de naissance."""
    bd = record.birth_date
    assert bd is not None  # garanti par l'appelant

    if f"{bd.year % 100:02d}" != parsed.annee_naissance:
        errors.append(
            DetectedError(
                type="birth_year_nina_mismatch",
                field="birth_date",
                severity=Severity.MEDIUM,
                message="L'année encodée dans le NINA ne correspond pas à la date de naissance.",
                confidence=0.8,
                details={"nina_year": parsed.annee_naissance, "birth_year": bd.year},
            )
        )
    if f"{bd.month:02d}" != parsed.mois_naissance:
        errors.append(
            DetectedError(
                type="birth_month_nina_mismatch",
                field="birth_date",
                severity=Severity.MEDIUM,
                message="Le mois encodé dans le NINA ne correspond pas à la date de naissance.",
                confidence=0.75,
                details={"nina_month": parsed.mois_naissance, "birth_month": bd.month},
            )
        )


def _check_nina_geo(
    record: NormalizedRecord,
    parsed: nina_rules.ParsedNina,
    errors: list[DetectedError],
) -> None:
    """Vérifie la validité du code région et sa cohérence avec le lieu de naissance."""
    region_name = region_name_for_digit(parsed.region)
    if region_name is None:
        errors.append(
            DetectedError(
                type="nina_region_invalid",
                field="nina",
                severity=Severity.MEDIUM,
                message=f"Le code région du NINA ({parsed.region}) ne correspond à aucune "
                "région connue (1-9).",
                confidence=0.85,
                details={"region_code": parsed.region},
            )
        )
        return

    # Cohérence avec le lieu de naissance déclaré (fuzzy, tolérant).
    if record.birth_region:
        comparison = compare_names(region_name, record.birth_region)
        if comparison.overall_similarity < 55.0:
            errors.append(
                DetectedError(
                    type="geo_inconsistency",
                    field="birth_place",
                    severity=Severity.MEDIUM,
                    message=f"Le lieu de naissance déclaré ne correspond pas à la région du "
                    f"NINA ({region_name}).",
                    confidence=0.7,
                    details={
                        "nina_region": region_name,
                        "declared": record.birth_region,
                        "similarity": comparison.overall_similarity,
                    },
                )
            )


# ─── Règle 2 — date de naissance ────────────────────────────────────
def _check_birth_date(record: NormalizedRecord, errors: list[DetectedError]) -> None:
    """Vérifie la validité de la date de naissance (format, futur, trop ancienne)."""
    if record.birth_date_has_letters:
        errors.append(
            DetectedError(
                type="birth_date_has_letters",
                field="birth_date",
                severity=Severity.HIGH,
                message="La date de naissance contient des caractères non numériques.",
                confidence=1.0,
                details={"value": record.birth_date_raw},
            )
        )
        return

    if record.birth_date_parse_failed:
        errors.append(
            DetectedError(
                type="birth_date_invalid_format",
                field="birth_date",
                severity=Severity.HIGH,
                message="La date de naissance est illisible (format non reconnu).",
                confidence=0.95,
                details={"value": record.birth_date_raw},
            )
        )
        return

    bd = record.birth_date
    assert bd is not None
    today = date.today()  # noqa: DTZ011 - date civile locale suffisante
    if bd > today:
        errors.append(
            DetectedError(
                type="birth_date_in_future",
                field="birth_date",
                severity=Severity.CRITICAL,
                message="La date de naissance est dans le futur.",
                confidence=1.0,
                details={"value": bd.isoformat()},
            )
        )
    elif bd.year < 1900:
        errors.append(
            DetectedError(
                type="birth_date_too_old",
                field="birth_date",
                severity=Severity.HIGH,
                message="La date de naissance est antérieure à 1900 (improbable).",
                confidence=0.9,
                details={"value": bd.isoformat()},
            )
        )


# ─── Règle 8 — caractères suspects ──────────────────────────────────
def _check_suspicious_chars(record: NormalizedRecord, errors: list[DetectedError]) -> None:
    """Détecte des chiffres dans les noms (saisie corrompue)."""
    for field_name, value in (("first_name", record.first_name), ("last_name", record.last_name)):
        if any(c.isdigit() for c in value):
            errors.append(
                DetectedError(
                    type="suspicious_characters",
                    field=field_name,
                    severity=Severity.HIGH,
                    message=f"Le champ {field_name} contient des chiffres.",
                    confidence=0.95,
                    details={"value": value},
                )
            )


# ─── Règle 6 — inversion de champs ──────────────────────────────────
def _check_name_inversion(record: NormalizedRecord, errors: list[DetectedError]) -> None:
    """Détecte l'inversion nom/prénom et le prénom égal à un nom de parent."""
    # 6a — inversion nom/prénom : le prénom ressemble à un nom de famille connu
    # ET le nom de famille ressemble à un prénom connu.
    if is_common_last_name(record.first_name) and is_common_first_name(record.last_name):
        errors.append(
            DetectedError(
                type="name_inversion",
                field="first_name",
                severity=Severity.MEDIUM,
                message="Le prénom et le nom semblent inversés.",
                confidence=0.75,
                details={"first_name": record.first_name, "last_name": record.last_name},
            )
        )

    # 6b — prénom citoyen identique à un *token* du nom d'un parent (fuzz > 90).
    # On compare token par token car le champ parent contient « Prénom Nom » :
    # comparer le prénom seul à la chaîne complète ne déclencherait jamais.
    for parent_label, parent_value in (("father", record.father), ("mother", record.mother)):
        tokens = parent_value.split()
        if not tokens:
            continue
        best = max(compare_names(record.first_name, tok).overall_similarity for tok in tokens)
        if best > _INVERSION_THRESHOLD:
            errors.append(
                DetectedError(
                    type="first_name_equals_parent",
                    field="first_name",
                    severity=Severity.MEDIUM,
                    message=f"Le prénom du citoyen est quasi identique à un nom du parent "
                    f"({parent_label}).",
                    confidence=0.65,
                    details={"parent": parent_label, "similarity": best},
                )
            )


# ─── Règle 7 — fautes d'orthographe ─────────────────────────────────
def _check_spelling(
    record: NormalizedRecord,
    errors: list[DetectedError],
    suggestions: list[Suggestion],
) -> None:
    """Propose une correction quand un nom est *proche* d'une référence connue."""
    _check_one_spelling(
        field_name="first_name",
        value=record.first_name,
        already_known=is_common_first_name(record.first_name),
        candidates=all_common_first_names(),
        errors=errors,
        suggestions=suggestions,
    )
    _check_one_spelling(
        field_name="last_name",
        value=record.last_name,
        already_known=is_common_last_name(record.last_name),
        candidates=all_common_last_names(),
        errors=errors,
        suggestions=suggestions,
    )


def _check_one_spelling(
    *,
    field_name: str,
    value: str,
    already_known: bool,
    candidates: list[str],
    errors: list[DetectedError],
    suggestions: list[Suggestion],
) -> None:
    if already_known or not value:
        return
    match = best_match(value, candidates)
    if match is None:
        return
    candidate, score = match
    if _SPELLING_LOWER <= score <= _SPELLING_UPPER:
        errors.append(
            DetectedError(
                type="possible_misspelling",
                field=field_name,
                severity=Severity.LOW,
                message=f"Le {field_name} ressemble à une orthographe connue mais n'y correspond "
                "pas exactement.",
                confidence=round(score / 100.0, 2),
                details={"closest": candidate, "score": round(score, 1)},
            )
        )
        suggestions.append(
            Suggestion(
                field=field_name,
                current_value=value,
                proposed_value=candidate.title(),
                confidence=round(score / 100.0, 2),
                reason="Orthographe la plus proche dans le référentiel des noms maliens.",
            )
        )


# ─── Règle complémentaire — plausibilité linguistique ───────────────
def _check_language(record: NormalizedRecord, errors: list[DetectedError]) -> None:
    """Signale une langue déclarée peu plausible pour la région (faible gravité)."""
    if record.language and record.birth_region:
        if not language_plausible(record.language, record.birth_region):
            errors.append(
                DetectedError(
                    type="language_region_unlikely",
                    field="language",
                    severity=Severity.LOW,
                    message="La langue déclarée est peu courante pour la région de naissance.",
                    confidence=0.5,
                    details={"language": record.language, "region": record.birth_region},
                )
            )
