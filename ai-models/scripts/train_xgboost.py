"""
train_xgboost.py — Entraîne le modèle XGBoost de détection d'erreurs NINA.

Lit le dataset synthétique (`generate_synthetic_dataset.py`), construit les
**9 features** attendues par le scorer (`app/services/scorer.py`,
`_MODEL_FEATURE_ORDER`), entraîne un `XGBClassifier`, évalue (AUC/F1) et
sérialise un bundle joblib dans `ai-models/trained/nina_detector_v1.pkl`.

⚠️ L'ordre des features DOIT rester identique à `_MODEL_FEATURE_ORDER`, sinon
le scoring en ligne serait incohérent.

Usage :
    python ai-models/scripts/train_xgboost.py

Dépendances (extra `train`) : xgboost, scikit-learn, pandas, joblib.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

# Source de vérité UNIQUE des features : on importe l'extracteur partagé du
# service (le scorer en ligne utilise EXACTEMENT le même) pour éliminer tout
# drift entre entraînement et inférence.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services" / "ai-service"))
from app.services.features import FEATURE_NAMES, extract_features  # noqa: E402


def build_features(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Construit la matrice de features (ordre FEATURE_NAMES) et la cible.

    Applique `extract_features` ligne par ligne — même calcul qu'à l'inférence.
    """

    def _vec(row) -> list[float]:  # noqa: ANN001 - namedtuple pandas
        feats = extract_features(
            nina=str(row.nina),
            first_name=str(row.first_name),
            last_name=str(row.last_name),
            birth_date=str(row.birth_date),
            sex=str(row.sex),
            birth_region=str(row.birth_region),
            father_name=str(row.father_name),
            mother_name=str(row.mother_name),
        )
        return [feats[name] for name in FEATURE_NAMES]

    matrix = [_vec(r) for r in df.itertuples(index=False)]
    return np.asarray(matrix, dtype=float), df["has_error"].astype(int).to_numpy()


def main(csv: str, out: str) -> None:
    """Entraîne, évalue et sérialise le modèle."""
    import joblib
    import xgboost as xgb
    from sklearn.metrics import f1_score, roc_auc_score
    from sklearn.model_selection import train_test_split

    df = pd.read_csv(csv)
    X, y = build_features(df)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric="auc",
        tree_method="hist",
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_prob = model.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)
    print(f"AUC : {roc_auc_score(y_test, y_prob):.4f}")
    print(f"F1  : {f1_score(y_test, y_pred):.4f}")

    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "feature_names": FEATURE_NAMES,
            "version": "v1.0.0",
            "trained_at": date.today().isoformat(),
        },
        out_path,
    )
    print(f"[OK] Modele sauvegarde -> {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Entraîne le détecteur XGBoost NINA")
    parser.add_argument("--csv", default="ai-models/datasets/nina_synthetic_v1.csv")
    parser.add_argument("--out", default="ai-models/trained/nina_detector_v1.pkl")
    args = parser.parse_args()
    main(args.csv, args.out)
