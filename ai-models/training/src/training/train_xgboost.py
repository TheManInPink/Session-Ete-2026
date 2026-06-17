"""
Entraînement du détecteur d'erreurs de saisie NINA (XGBoost multi-classes).

Pipeline :

1. Chargement + normalisation du dataset (``training.data``).
2. Découpe stratifiée 60/20/20 (train/val/test) reproductible.
3. ``FeatureBuilder.fit`` sur **train** puis ``transform`` des trois jeux.
4. ``GridSearchCV`` (5-fold stratifié) sur ``max_depth`` / ``learning_rate`` /
   ``n_estimators``, scoring ``f1_weighted``.
5. Métriques : AUC-ROC (binaire + multi OVR pondéré), F1 pondéré,
   precision/recall **par type d'erreur**.
6. Journalisation MLflow (optionnelle — repli JSON si MLflow absent).
7. Export du meilleur modèle :
   ``ai-models/exported/xgboost_v1.joblib`` + ``metadata.json``.

Le ``.joblib`` est un **bundle** auto-suffisant
(``model`` + ``feature_builder`` + ``label_encoder`` + métadonnées) : ``ai-service``
le charge tel quel et reproduit les variables à l'identique au moment de l'inférence.

Usage :

    python -m training.train_xgboost --dataset ../datasets/nina_synthetic_v1.csv
    python -m training.train_xgboost --grid fast        # 1 combinaison (CI rapide)
    python -m training.train_xgboost --min-f1 0.85      # porte qualité (exit≠0 si raté)

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost as xgb
from sklearn.metrics import (
    classification_report,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.preprocessing import LabelEncoder

from . import data as data_mod
from .features import FeatureBuilder

# Grilles d'hyperparamètres. ``fast`` = 1 combinaison (CI / itération rapide) ;
# ``full`` = recherche complète (8 combinaisons).
_GRIDS: dict[str, dict[str, list]] = {
    "fast": {"max_depth": [6], "learning_rate": [0.3], "n_estimators": [200]},
    "full": {
        "max_depth": [4, 6],
        "learning_rate": [0.1, 0.3],
        "n_estimators": [200, 400],
    },
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analyse les arguments de la ligne de commande."""
    p = argparse.ArgumentParser(
        description="Entraîne le détecteur d'erreurs NINA (XGBoost multi-classes)."
    )
    p.add_argument(
        "--dataset",
        type=Path,
        default=data_mod.DEFAULT_DATASET,
        help="CSV synthétique d'entraînement (défaut : ai-models/datasets/nina_synthetic_v1.csv).",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=data_mod.EXPORTED_DIR,
        help="Répertoire d'export du modèle (défaut : ai-models/exported).",
    )
    p.add_argument("--model-name", default="xgboost_v1", help="Nom de base de l'artefact exporté.")
    p.add_argument("--grid", choices=list(_GRIDS), default="full", help="Grille d'hyperparamètres.")
    p.add_argument("--cv-folds", type=int, default=5, help="Nombre de plis de validation croisée.")
    p.add_argument("--random-state", type=int, default=42, help="Graine de reproductibilité.")
    p.add_argument("--mlflow-uri", default=None, help="Tracking URI MLflow (ex. file:./mlruns).")
    p.add_argument(
        "--no-mlflow", action="store_true", help="Désactive toute journalisation MLflow."
    )
    p.add_argument(
        "--min-f1", type=float, default=None, help="Porte qualité : F1 pondéré test min."
    )
    p.add_argument(
        "--min-auc", type=float, default=None, help="Porte qualité : AUC binaire test min."
    )
    return p.parse_args(argv)


def _hash_file(path: Path) -> str:
    """Empreinte SHA-256 d'un fichier (reproductibilité du dataset source)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _evaluate(
    model: xgb.XGBClassifier,
    x: pd.DataFrame,
    y_enc: np.ndarray,
    label_encoder: LabelEncoder,
) -> dict:
    """Calcule les métriques d'un jeu : F1 pondéré, AUC (binaire + multi), par-classe.

    Args:
        model: Classifieur entraîné.
        x: Matrice de variables du jeu évalué.
        y_enc: Cible encodée (entiers) du jeu évalué.
        label_encoder: Encodeur ajusté (pour retrouver les noms de classes).

    Returns:
        Dictionnaire de métriques JSON-sérialisable.
    """
    classes = list(label_encoder.classes_)
    n_classes = len(classes)
    proba = model.predict_proba(x)
    preds = proba.argmax(axis=1)

    f1w = float(f1_score(y_enc, preds, average="weighted", zero_division=0))

    # AUC multi-classes OVR pondéré (robuste si une classe manque du sous-jeu).
    try:
        auc_multi = float(
            roc_auc_score(
                y_enc, proba, multi_class="ovr", average="weighted", labels=range(n_classes)
            )
        )
    except ValueError:
        auc_multi = float("nan")

    # AUC binaire : P(au moins une erreur) = 1 − P(classe "none").
    metrics: dict = {"f1_weighted": f1w, "auc_multiclass_ovr_weighted": auc_multi}
    if data_mod.CLEAN_LABEL in classes:
        none_idx = classes.index(data_mod.CLEAN_LABEL)
        p_error = 1.0 - proba[:, none_idx]
        y_bin = (y_enc != none_idx).astype(int)
        if len(np.unique(y_bin)) == 2:
            metrics["auc_binary_has_error"] = float(roc_auc_score(y_bin, p_error))

    # Precision / recall PAR TYPE D'ERREUR.
    report = classification_report(
        y_enc,
        preds,
        labels=range(n_classes),
        target_names=classes,
        output_dict=True,
        zero_division=0,
    )
    metrics["per_class"] = {
        cls: {
            "precision": round(float(report[cls]["precision"]), 4),
            "recall": round(float(report[cls]["recall"]), 4),
            "f1": round(float(report[cls]["f1-score"]), 4),
            "support": int(report[cls]["support"]),
        }
        for cls in classes
        if cls in report
    }

    # Arrondi sûr : une AUC non-finie (classe absente du sous-jeu) devient `None`
    # — sinon json.dumps émet un littéral `NaN` invalide rejeté par les parseurs
    # JSON stricts (ex. ai-service).
    def _safe_round(value: float | None) -> float | None:
        if value is None or not math.isfinite(value):
            return None
        return round(value, 4)

    metrics["f1_weighted"] = _safe_round(metrics["f1_weighted"])
    metrics["auc_multiclass_ovr_weighted"] = _safe_round(metrics["auc_multiclass_ovr_weighted"])
    if "auc_binary_has_error" in metrics:
        metrics["auc_binary_has_error"] = _safe_round(metrics["auc_binary_has_error"])
    return metrics


def _log_mlflow(uri: str | None, params: dict, metrics: dict, artifacts: list[Path]) -> bool:
    """Journalise un run MLflow si la lib est disponible.

    Args:
        uri: Tracking URI (``None`` → store local ``./mlruns``).
        params: Hyperparamètres à logger.
        metrics: Métriques scalaires (les sous-dictionnaires sont aplatis).
        artifacts: Fichiers à attacher au run.

    Returns:
        ``True`` si MLflow a été utilisé, ``False`` sinon (repli JSON ailleurs).
    """
    try:
        import mlflow
    except ImportError:
        return False

    mlflow.set_tracking_uri(uri or "file:./mlruns")
    mlflow.set_experiment("nina-error-detection")
    with mlflow.start_run(run_name="xgboost"):
        mlflow.log_params(params)
        for split, block in metrics.items():
            if not isinstance(block, dict):
                continue
            for key, val in block.items():
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    mlflow.log_metric(f"{split}_{key}", float(val))
        for art in artifacts:
            if art.exists():
                mlflow.log_artifact(str(art))
    return True


def train(args: argparse.Namespace) -> dict:
    """Exécute l'entraînement complet et exporte le bundle. Retourne les métadonnées."""
    print(f"[1/7] Chargement du dataset : {args.dataset}")
    df = data_mod.load_dataset(args.dataset)
    classes = data_mod.ordered_classes(df[data_mod.LABEL_COL])
    print(f"      {len(df)} lignes · {len(classes)} classes : {classes}")

    # Encodage de la cible (ordre canonique forcé pour des indices de colonnes
    # proba stables, partagés avec ai-service).
    label_encoder = LabelEncoder()
    label_encoder.classes_ = np.array(classes)
    # Garde-fou : l'assignation manuelle d'un `classes_` NON trié ne fonctionne
    # que grâce au dispatch NON-NUMÉRIQUE de sklearn (lookup par dict pour les
    # dtypes non numériques, dont les chaînes), et non au tri par searchsorted.
    # On vérifie le round-trip pour transformer toute régression future en échec
    # BRUYANT plutôt qu'en mauvais encodage silencieux.
    roundtrip = label_encoder.transform(np.array(classes))
    if list(roundtrip) != list(range(len(classes))):
        raise RuntimeError(
            "LabelEncoder n'encode pas l'ordre canonique attendu — "
            "encodage potentiellement corrompu, arrêt."
        )
    y = df[data_mod.LABEL_COL]
    y_enc_all = label_encoder.transform(y)

    print("[2/7] Découpe stratifiée 60/20/20…")
    train_idx, val_idx, test_idx = data_mod.make_splits(len(df), y, random_state=args.random_state)
    df_train, df_val, df_test = df.iloc[train_idx], df.iloc[val_idx], df.iloc[test_idx]

    print("[3/7] Ingénierie de variables (fit sur train uniquement)…")
    builder = FeatureBuilder()
    x_train = builder.fit_transform(df_train)
    x_val = builder.transform(df_val)
    x_test = builder.transform(df_test)
    y_train, y_val, y_test = y_enc_all[train_idx], y_enc_all[val_idx], y_enc_all[test_idx]
    print(f"      {x_train.shape[1]} variables : {list(x_train.columns)}")

    # Garde-fou : XGBoost (wrapper sklearn) IGNORE num_class et RÉ-INFÈRE les
    # classes depuis y_train, exigeant un ensemble dense 0..k-1. Si une classe
    # rare tombe hors du jeu d'entraînement, `fit` planterait avec un message
    # obscur. On le détecte tôt avec un message clair.
    present_train = {int(v) for v in np.unique(y_train)}
    missing = set(range(len(classes))) - present_train
    if missing:
        miss_names = [classes[i] for i in sorted(missing)]
        raise ValueError(
            f"Classes absentes du jeu d'entraînement : {miss_names}. "
            "Dataset trop déséquilibré (XGBoost infère un ensemble de classes "
            "dense). Augmentez l'échantillon ou fusionnez ces classes."
        )

    print(f"[4/7] GridSearchCV ({args.grid}, {args.cv_folds}-fold, scoring=f1_weighted)…")
    # num_class n'est PAS passé : il est ignoré par le wrapper sklearn (classes
    # inférées de y_train), le passer donnerait une fausse impression de contrat.
    base = xgb.XGBClassifier(
        objective="multi:softprob",
        tree_method="hist",
        eval_metric="mlogloss",
        n_jobs=-1,
        random_state=args.random_state,
    )
    cv = StratifiedKFold(n_splits=args.cv_folds, shuffle=True, random_state=args.random_state)
    grid = GridSearchCV(
        base, _GRIDS[args.grid], scoring="f1_weighted", cv=cv, n_jobs=-1, refit=True, verbose=0
    )
    grid.fit(x_train, y_train)
    best = grid.best_estimator_
    print(f"      meilleurs paramètres : {grid.best_params_}  (CV f1={grid.best_score_:.4f})")

    print("[5/7] Évaluation (val + test)…")
    metrics = {
        "val": _evaluate(best, x_val, y_val, label_encoder),
        "test": _evaluate(best, x_test, y_test, label_encoder),
    }
    print(
        f"      TEST  f1_weighted={metrics['test']['f1_weighted']}  "
        f"auc_binary={metrics['test'].get('auc_binary_has_error')}  "
        f"auc_multi={metrics['test']['auc_multiclass_ovr_weighted']}"
    )

    print("[6/7] Export du bundle…")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    joblib_path = args.output_dir / f"{args.model_name}.joblib"
    metadata_path = args.output_dir / "metadata.json"

    metadata = {
        "model_name": args.model_name,
        "model_type": "xgboost.XGBClassifier (multi:softprob)",
        "task": "détection multi-classes du type d'erreur de saisie NINA",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(args.dataset),
        "dataset_sha256": _hash_file(args.dataset),
        "n_samples": int(len(df)),
        "random_state": args.random_state,
        "split": {"train": len(train_idx), "val": len(val_idx), "test": len(test_idx)},
        "classes": classes,
        "feature_names": list(x_train.columns),
        "n_features": int(x_train.shape[1]),
        "best_params": grid.best_params_,
        "cv": {
            "folds": args.cv_folds,
            "scoring": "f1_weighted",
            "best_score": round(float(grid.best_score_), 4),
        },
        "metrics": metrics,
        "thresholds": {"ai_auto": 85.0, "ai_review": 60.0},
        "versions": {
            "python": platform.python_version(),
            "scikit_learn": sklearn.__version__,
            "xgboost": xgb.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "bundle_keys": ["model", "feature_builder", "label_encoder", "classes", "feature_names"],
        "notes": (
            "Dataset synthétique : la séparabilité est élevée (les variables de "
            "cohérence NINA sont quasi-parfaites). Les performances en production "
            "sur des données réelles RAVEC seront nécessairement inférieures."
        ),
    }

    bundle = {
        "model": best,
        "feature_builder": builder,
        "label_encoder": label_encoder,
        "classes": classes,
        "feature_names": list(x_train.columns),
        "metadata": metadata,
    }
    joblib.dump(bundle, joblib_path)

    # Empreinte d'intégrité (sidecar .sha256) — vérifiée par ai-service AVANT la
    # désérialisation pickle (cf. ADR-030 / doc 15). On l'inscrit aussi dans les
    # métadonnées (informatif). Format `<hex>  <nom>` (compatible `sha256sum -c`).
    bundle_sha = _hash_file(joblib_path)
    metadata["bundle_sha256"] = bundle_sha
    sha_path = joblib_path.with_suffix(joblib_path.suffix + ".sha256")
    sha_path.write_text(f"{bundle_sha}  {joblib_path.name}\n", encoding="utf-8")

    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"      → {joblib_path}")
    print(f"      → {sha_path} (intégrité)")
    print(f"      → {metadata_path}")

    print("[7/7] Journalisation des métriques…")
    used_mlflow = False
    if not args.no_mlflow:
        used_mlflow = _log_mlflow(
            args.mlflow_uri,
            {"grid": args.grid, "cv_folds": args.cv_folds, **grid.best_params_},
            metrics,
            [joblib_path, metadata_path],
        )
    if used_mlflow:
        print("      MLflow : run enregistré.")
    else:
        run_path = args.output_dir / f"{args.model_name}.run.json"
        run_path.write_text(
            json.dumps({"params": grid.best_params_, "metrics": metrics}, indent=2),
            encoding="utf-8",
        )
        print(f"      MLflow absent → repli JSON : {run_path}")

    return metadata


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI. Retourne un code de sortie (0 = succès, 1 = porte qualité ratée)."""
    data_mod.configure_console()
    args = parse_args(argv)
    metadata = train(args)

    test_metrics = metadata["metrics"]["test"]
    failures = []
    f1 = test_metrics.get("f1_weighted")
    if args.min_f1 is not None and (f1 is None or f1 < args.min_f1):
        failures.append(f"F1 pondéré test {f1} < seuil {args.min_f1}")
    auc_bin = test_metrics.get("auc_binary_has_error")
    if args.min_auc is not None and (auc_bin is None or auc_bin < args.min_auc):
        failures.append(f"AUC binaire test {auc_bin} < seuil {args.min_auc}")

    if failures:
        print("\n❌ Porte qualité NON satisfaite :")
        for f in failures:
            print(f"   - {f}")
        return 1

    print("\n✅ Entraînement terminé.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
