"""
Scoring d'intégrité des agents SIGAC — bandes de gouvernance + garde-fous runbook.

Source de vérité : ``docs/sigac/SCORING-RUNBOOK.md`` §1 et doc 23 §4.1. Ce module
encode les **garde-fous non négociables** du runbook :

- **Garde-fou n°1 (anti-zéro pénalisant)** : un agent avec moins de
  ``SIGAC_MIN_ACTIONS_FOR_SCORE`` actions reçoit la bande ``INSUFFICIENT_DATA`` —
  **JAMAIS** un score de 0. L'inactivité n'est pas une suspicion.
- **Convention de sens** : ``overallScore`` ÉLEVÉ = BON (agent intègre). Bandes
  versionnées (ADR-023) : ``≥85 INTEGRE`` / ``70-84 A_SURVEILLER`` / ``<70 A_INVESTIGUER``.
- **Advisory only (principe directeur n°1)** : ce module **ne sanctionne pas** et
  **ne déclenche aucune action automatique**. Il calcule un signal + une bande +,
  pour la bande basse, un drapeau ``flagged_for_investigation`` qui n'est qu'une
  **recommandation d'examen humain** (OCLEI), exécutée via un rôle
  ``inspector``/``prosecutor`` (cf. ``app/auth.require_role``). Le ML cible
  l'enquête, il ne la remplace pas.

> Aucune écriture de sanction, aucune mutation d'état agent ici : la séparation
> stricte « calcul de signal » vs « décision humaine » est la garantie centrale.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import settings

# ── Bandes de gouvernance (libellés Prisma, runbook §1.2) ──────────────────────
BAND_INTEGRE = "INTEGRE"
BAND_A_SURVEILLER = "A_SURVEILLER"
BAND_A_INVESTIGUER = "A_INVESTIGUER"
BAND_INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


@dataclass(frozen=True)
class IntegrityResult:
    """Résultat de scoring d'intégrité d'un agent — **signal consultatif**, pas une décision.

    ``flagged_for_investigation`` n'est PAS une sanction : c'est une recommandation
    d'examen humain (OCLEI). ``overall_score`` est ``None`` en cas de données
    insuffisantes (jamais un 0 pénalisant).
    """

    band: str
    overall_score: float | None
    flagged_for_investigation: bool
    n_actions: int
    # ``advisory`` est toujours True : ce service n'émet que des signaux. Aucune
    # sanction n'est jamais appliquée automatiquement (principe directeur n°1).
    advisory: bool = True


def band_for_score(overall_score: float) -> str:
    """Retourne la bande de gouvernance pour un ``overall_score`` (échelle 100 = bon).

    Seuils pilotés par la config (ADR-023) : ``≥ integrity_band_integre`` → INTEGRE ;
    ``≥ integrity_band_investigate`` → A_SURVEILLER ; sinon A_INVESTIGUER.

    Args:
        overall_score: score global 0-100 (élevé = agent intègre).

    Returns:
        Le libellé de bande (``INTEGRE`` | ``A_SURVEILLER`` | ``A_INVESTIGUER``).
    """
    if overall_score >= settings.integrity_band_integre:
        return BAND_INTEGRE
    if overall_score >= settings.integrity_band_investigate:
        return BAND_A_SURVEILLER
    return BAND_A_INVESTIGUER


def score_integrity(overall_score: float | None, n_actions: int) -> IntegrityResult:
    """Produit le résultat d'intégrité d'un agent en appliquant les garde-fous runbook.

    GARDE-FOU N°1 (anti-zéro pénalisant) : si ``n_actions`` est sous le seuil
    ``SIGAC_MIN_ACTIONS_FOR_SCORE``, on renvoie ``INSUFFICIENT_DATA`` avec
    ``overall_score=None`` et ``flagged_for_investigation=False`` — l'inactivité ne
    doit JAMAIS être traitée comme un score bas (cf. runbook §1.2, garde-fou n°1).

    ADVISORY ONLY : même en bande basse, on ne fait que **drapeauter pour examen
    humain** ; aucune sanction n'est appliquée ici (principe directeur n°1).

    Args:
        overall_score: score agrégé 0-100 (ou ``None`` si non calculable en amont).
        n_actions: nombre d'actions de l'agent sur la fenêtre d'observation.

    Returns:
        Un :class:`IntegrityResult` (bande, score éventuel, drapeau d'examen, advisory).
    """
    if n_actions < settings.min_actions_for_score or overall_score is None:
        # Données insuffisantes : surtout PAS un 0 pénalisant, surtout PAS de flag.
        return IntegrityResult(
            band=BAND_INSUFFICIENT_DATA,
            overall_score=None,
            flagged_for_investigation=False,
            n_actions=n_actions,
        )
    band = band_for_score(overall_score)
    # Le drapeau d'investigation n'est qu'une RECOMMANDATION d'examen humain OCLEI :
    # il ne déclenche aucune sanction automatique (un humain INSPECTOR/PROSECUTOR agit).
    flagged = band == BAND_A_INVESTIGUER
    return IntegrityResult(
        band=band,
        overall_score=round(float(overall_score), 2),
        flagged_for_investigation=flagged,
        n_actions=n_actions,
    )
