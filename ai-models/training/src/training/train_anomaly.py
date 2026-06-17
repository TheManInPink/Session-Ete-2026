"""
Entraînement de l'Isolation Forest pour le SIGAC (Bloc D — anti-corruption).

À ce stade du projet, aucun journal comportemental réel d'agents n'existe. Ce
script **génère un dataset synthétique** de comportements d'agents d'état civil,
y injecte ~5 % de profils anormaux (corruption simulée : auto-validation,
activité nocturne, validations expéditives…), entraîne un Isolation Forest
``contamination=0.05`` et exporte un bundle réutilisable par le futur
``anticorruption-service`` (port 3009).

Le dataset synthétique est aussi écrit dans ``ai-models/datasets/`` pour
inspection et reproductibilité.

Usage :

    python -m training.train_anomaly --n-agents 800 --contamination 0.05

⚠️ Académique : les heuristiques d'anomalie sont des hypothèses de modélisation,
pas un référentiel validé terrain.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from . import data as data_mod

# Variables comportementales modélisées (une ligne = un agent, agrégé sur 30 j).
FEATURE_NAMES = [
    "corrections_per_day",  # volume de corrections / jour
    "avg_validation_seconds",  # temps moyen d'instruction d'un dossier
    "night_activity_ratio",  # part d'activité 22 h–05 h
    "weekend_activity_ratio",  # part d'activité le week-end
    "self_approval_ratio",  # part de dossiers auto-validés (drapeau fort)
    "rejection_rate",  # taux de rejet des dossiers instruits
    "unique_communes_touched",  # dispersion géographique des dossiers
    "high_value_correction_ratio",  # part de corrections « sensibles »
    "repeat_citizen_ratio",  # part de citoyens traités plusieurs fois
    "after_hours_logins",  # connexions hors plage horaire
]


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analyse les arguments de la ligne de commande."""
    p = argparse.ArgumentParser(description="Entraîne l'Isolation Forest SIGAC (anomalies agents).")
    p.add_argument("--n-agents", type=int, default=800, help="Nombre d'agents synthétiques.")
    p.add_argument("--contamination", type=float, default=0.05, help="Proportion d'anomalies.")
    p.add_argument(
        "--n-estimators", type=int, default=200, help="Nombre d'arbres de l'Isolation Forest."
    )
    p.add_argument("--seed", type=int, default=42, help="Graine de reproductibilité.")
    p.add_argument(
        "--output-dir",
        type=Path,
        default=data_mod.EXPORTED_DIR,
        help="Répertoire d'export (défaut : ai-models/exported).",
    )
    p.add_argument("--model-name", default="isolation_forest_v1", help="Nom de base de l'artefact.")
    return p.parse_args(argv)


def generate_agents(n_agents: int, contamination: float, seed: int) -> pd.DataFrame:
    """Génère un dataset comportemental synthétique d'agents.

    Args:
        n_agents: Nombre total d'agents à simuler.
        contamination: Proportion d'agents au comportement anormal (corruption).
        seed: Graine du générateur aléatoire.

    Returns:
        DataFrame ``[FEATURE_NAMES + 'is_anomaly_truth']`` (vérité terrain pour audit).
    """
    rng = np.random.default_rng(seed)
    n_anom = int(round(n_agents * contamination))
    n_norm = n_agents - n_anom

    # ── Agents « normaux » ──────────────────────────────────────────────────
    normal = {
        "corrections_per_day": rng.gamma(shape=6.0, scale=3.0, size=n_norm),  # ~18/j
        "avg_validation_seconds": rng.normal(180, 40, n_norm).clip(30, None),  # ~3 min
        "night_activity_ratio": rng.beta(1.5, 30, n_norm),  # ~0.05
        "weekend_activity_ratio": rng.beta(1.5, 20, n_norm),  # ~0.07
        "self_approval_ratio": rng.beta(1.0, 60, n_norm),  # ~0.016
        "rejection_rate": rng.beta(4, 16, n_norm),  # ~0.20
        "unique_communes_touched": rng.poisson(4, n_norm).astype(float) + 1,
        "high_value_correction_ratio": rng.beta(2, 18, n_norm),  # ~0.10
        "repeat_citizen_ratio": rng.beta(1.5, 25, n_norm),  # ~0.06
        "after_hours_logins": rng.poisson(1.0, n_norm).astype(float),
    }

    # ── Agents « anormaux » (corruption simulée) ────────────────────────────
    anom = {
        "corrections_per_day": rng.gamma(shape=10.0, scale=8.0, size=n_anom),  # volume gonflé
        "avg_validation_seconds": rng.normal(35, 15, n_anom).clip(5, None),  # expéditif
        "night_activity_ratio": rng.beta(6, 6, n_anom),  # ~0.50
        "weekend_activity_ratio": rng.beta(5, 8, n_anom),  # élevé
        "self_approval_ratio": rng.beta(6, 6, n_anom),  # ~0.50 (drapeau)
        "rejection_rate": rng.beta(1, 30, n_anom),  # ne rejette ~jamais
        "unique_communes_touched": rng.poisson(18, n_anom).astype(float) + 1,  # dispersion
        "high_value_correction_ratio": rng.beta(8, 4, n_anom),  # ~0.67
        "repeat_citizen_ratio": rng.beta(6, 6, n_anom),  # ~0.50
        "after_hours_logins": rng.poisson(9.0, n_anom).astype(float),
    }

    df_norm = pd.DataFrame(normal)
    df_norm["is_anomaly_truth"] = 0
    df_anom = pd.DataFrame(anom)
    df_anom["is_anomaly_truth"] = 1

    df = pd.concat([df_norm, df_anom], ignore_index=True)
    # Mélange déterministe.
    return df.sample(frac=1.0, random_state=seed).reset_index(drop=True)


def train(args: argparse.Namespace) -> dict:
    """Génère, entraîne et exporte l'Isolation Forest. Retourne les métadonnées."""
    print(
        f"[1/4] Génération de {args.n_agents} agents synthétiques "
        f"(contamination={args.contamination})…"
    )
    df = generate_agents(args.n_agents, args.contamination, args.seed)
    x = df[FEATURE_NAMES].to_numpy(dtype=float)
    truth = df["is_anomaly_truth"].to_numpy()

    print("[2/4] Standardisation + entraînement Isolation Forest…")
    scaler = StandardScaler()
    x_scaled = scaler.fit_transform(x)
    model = IsolationForest(
        n_estimators=args.n_estimators,
        contamination=args.contamination,
        random_state=args.seed,
        n_jobs=-1,
    )
    model.fit(x_scaled)

    # Évaluation indicative vs vérité terrain injectée (-1 = anomalie pour IF).
    preds = (model.predict(x_scaled) == -1).astype(int)
    tp = int(((preds == 1) & (truth == 1)).sum())
    fp = int(((preds == 1) & (truth == 0)).sum())
    fn = int(((preds == 0) & (truth == 1)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    print(f"      détectés={preds.sum()}  precision={precision:.3f}  recall={recall:.3f}")

    print("[3/4] Sauvegarde du dataset synthétique…")
    data_mod.DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    agents_csv = data_mod.DATASETS_DIR / "agents_synthetic_v1.csv"
    df.to_csv(agents_csv, index=False)
    print(f"      → {agents_csv}")

    print("[4/4] Export du bundle…")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    joblib_path = args.output_dir / f"{args.model_name}.joblib"
    metadata_path = args.output_dir / f"{args.model_name}.metadata.json"

    metadata = {
        "model_name": args.model_name,
        "model_type": "sklearn.ensemble.IsolationForest",
        "task": "détection d'anomalies comportementales d'agents (SIGAC, Bloc D)",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "n_agents": args.n_agents,
        "contamination": args.contamination,
        "n_estimators": args.n_estimators,
        "feature_names": FEATURE_NAMES,
        "n_features": len(FEATURE_NAMES),
        "eval_vs_synthetic_truth": {
            "detected": int(preds.sum()),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
        },
        "versions": {
            "python": platform.python_version(),
            "scikit_learn": sklearn.__version__,
            "numpy": np.__version__,
        },
        "bundle_keys": ["model", "scaler", "feature_names"],
        "notes": "Comportements synthétiques — heuristiques académiques, non validées terrain.",
    }

    bundle = {
        "model": model,
        "scaler": scaler,
        "feature_names": FEATURE_NAMES,
        "metadata": metadata,
    }
    joblib.dump(bundle, joblib_path)
    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"      → {joblib_path}")
    print(f"      → {metadata_path}")
    return metadata


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI."""
    data_mod.configure_console()
    args = parse_args(argv)
    train(args)
    print("\n✅ Isolation Forest SIGAC entraîné.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
