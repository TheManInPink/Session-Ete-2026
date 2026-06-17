"""
Évaluation d'un modèle exporté → rapport HTML autonome.

Charge un bundle ``.joblib`` (cf. ``train_xgboost``), reconstitue **exactement**
le jeu de test (même découpe stratifiée, même graine), recalcule les métriques et
génère un rapport HTML contenant :

- une **matrice de confusion** (heatmap SVG),
- une **courbe ROC** binaire « erreur vs propre » (SVG),
- la **distribution des scores** P(erreur) propre vs erroné (histogramme SVG),
- le tableau precision / recall **par type d'erreur**.

Les graphiques sont du **SVG inline sans dépendance** (ni matplotlib, ni JS) —
conforme à la convention « charts SVG sans deps » du dépôt et au principe de
souveraineté (aucun CDN externe).

Usage :

    python -m training.evaluate --model ../exported/xgboost_v1.joblib

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

import argparse
import html
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import confusion_matrix, roc_auc_score, roc_curve

from . import data as data_mod

# Palette AES (cf. design system) : bleu primaire / vert succès / rouge danger.
_C_PRIMARY = "#1d4ed8"
_C_SUCCESS = "#15803d"
_C_DANGER = "#b91c1c"
_C_GRID = "#e2e8f0"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Analyse les arguments de la ligne de commande."""
    p = argparse.ArgumentParser(description="Génère un rapport d'évaluation HTML d'un modèle NINA.")
    p.add_argument(
        "--model",
        type=Path,
        default=data_mod.EXPORTED_DIR / "xgboost_v1.joblib",
        help="Bundle .joblib à évaluer.",
    )
    p.add_argument(
        "--dataset",
        type=Path,
        default=None,
        help="CSV d'évaluation (défaut : celui enregistré dans les métadonnées du modèle).",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Chemin du rapport HTML (défaut : ai-models/evaluation/report_<model>.html).",
    )
    return p.parse_args(argv)


# ──────────────────────────────────────────────────────────────────────────────
#  Helpers SVG (aucune dépendance externe)
# ──────────────────────────────────────────────────────────────────────────────
def _svg_confusion(cm: np.ndarray, classes: list[str]) -> str:
    """Rend une matrice de confusion en heatmap SVG.

    Args:
        cm: Matrice de confusion brute (lignes = vérité, colonnes = prédiction).
        classes: Noms des classes (ordre des lignes/colonnes).

    Returns:
        Une chaîne ``<svg>…</svg>``.
    """
    n = len(classes)
    cell, pad_l, pad_t = 46, 150, 150
    w, h = pad_l + n * cell + 20, pad_t + n * cell + 20
    row_max = cm.max(axis=1, keepdims=True).clip(min=1)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" font-size="11" font-family="sans-serif">'
    ]
    for i in range(n):
        for j in range(n):
            x, y = pad_l + j * cell, pad_t + i * cell
            intensity = cm[i, j] / row_max[i, 0]
            # Bleu pour la diagonale (correct), rouge pour le hors-diagonale (erreurs).
            base = _C_PRIMARY if i == j else _C_DANGER
            opacity = 0.12 + 0.85 * intensity if cm[i, j] else 0.04
            txt_color = "#fff" if intensity > 0.5 else "#0f172a"
            parts.append(
                f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" fill="{base}" '
                f'fill-opacity="{opacity:.3f}" stroke="{_C_GRID}"/>'
            )
            parts.append(
                f'<text x="{x + cell / 2:.0f}" y="{y + cell / 2 + 4:.0f}" '
                f'text-anchor="middle" fill="{txt_color}">{int(cm[i, j])}</text>'
            )
    for k, cls in enumerate(classes):
        # Étiquettes lignes (vérité) + colonnes (prédiction, pivotées).
        yc = pad_t + k * cell + cell / 2 + 4
        parts.append(
            f'<text x="{pad_l - 8}" y="{yc:.0f}" text-anchor="end" fill="#334155">{html.escape(cls)}</text>'
        )
        xc = pad_l + k * cell + cell / 2
        parts.append(
            f'<text x="{xc:.0f}" y="{pad_t - 8}" text-anchor="start" fill="#334155" '
            f'transform="rotate(-45 {xc:.0f} {pad_t - 8})">{html.escape(cls)}</text>'
        )
    parts.append(
        '<text x="10" y="20" fill="#0f172a" font-weight="bold">'
        "Vérité (lignes) × Prédiction (colonnes)</text>"
    )
    parts.append("</svg>")
    return "".join(parts)


def _svg_roc(fpr: np.ndarray, tpr: np.ndarray, auc: float) -> str:
    """Rend une courbe ROC binaire (erreur vs propre) en SVG."""
    w = h = 320
    m = 40  # marge
    box = w - 2 * m

    def pt(fx: float, ty: float) -> str:
        return f"{m + fx * box:.1f},{h - m - ty * box:.1f}"

    curve = " ".join(pt(float(a), float(b)) for a, b in zip(fpr, tpr))
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" font-size="11" font-family="sans-serif">',
        f'<rect x="{m}" y="{m}" width="{box}" height="{box}" fill="none" stroke="{_C_GRID}"/>',
        f'<line x1="{m}" y1="{h - m}" x2="{w - m}" y2="{m}" stroke="{_C_GRID}" stroke-dasharray="4 4"/>',
        f'<polyline points="{curve}" fill="none" stroke="{_C_PRIMARY}" stroke-width="2"/>',
        f'<text x="{w / 2:.0f}" y="{h - 8}" text-anchor="middle" fill="#334155">Taux de faux positifs</text>',
        f'<text x="14" y="{h / 2:.0f}" text-anchor="middle" fill="#334155" transform="rotate(-90 14 {h / 2:.0f})">Taux de vrais positifs</text>',
        f'<text x="{w - m}" y="{m + 16}" text-anchor="end" fill="{_C_PRIMARY}" font-weight="bold">AUC = {auc:.4f}</text>',
        "</svg>",
    ]
    return "".join(parts)


def _svg_score_hist(p_clean: np.ndarray, p_error: np.ndarray, bins: int = 20) -> str:
    """Rend la distribution de P(erreur) pour les lignes propres vs erronées."""
    w, h, m = 480, 260, 40
    box_w, box_h = w - 2 * m, h - 2 * m
    edges = np.linspace(0, 1, bins + 1)
    hc, _ = np.histogram(p_clean, bins=edges)
    he, _ = np.histogram(p_error, bins=edges)
    top = max(hc.max(), he.max(), 1)
    bw = box_w / bins
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" font-size="11" font-family="sans-serif">'
    ]
    parts.append(
        f'<rect x="{m}" y="{m}" width="{box_w}" height="{box_h}" fill="none" stroke="{_C_GRID}"/>'
    )
    for k in range(bins):
        x = m + k * bw
        for counts, color in ((hc, _C_SUCCESS), (he, _C_DANGER)):
            bh = box_h * counts[k] / top
            parts.append(
                f'<rect x="{x:.1f}" y="{m + box_h - bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" '
                f'fill="{color}" fill-opacity="0.5"/>'
            )
    parts.append(f'<text x="{m}" y="{h - 12}" fill="{_C_SUCCESS}">■ propre</text>')
    parts.append(f'<text x="{m + 80}" y="{h - 12}" fill="{_C_DANGER}">■ erroné</text>')
    parts.append(
        f'<text x="{w / 2:.0f}" y="{h - 12}" text-anchor="middle" fill="#334155">P(erreur)</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def _per_class_table(per_class: dict) -> str:
    """Rend le tableau HTML precision / recall / F1 par classe."""
    rows = ["<tr><th>Classe</th><th>Précision</th><th>Rappel</th><th>F1</th><th>Support</th></tr>"]
    for cls, m in per_class.items():
        rows.append(
            f"<tr><td>{html.escape(cls)}</td><td>{m['precision']:.3f}</td>"
            f"<td>{m['recall']:.3f}</td><td>{m['f1']:.3f}</td><td>{m['support']}</td></tr>"
        )
    return f"<table>{''.join(rows)}</table>"


def build_report(model_path: Path, dataset: Path | None, output: Path | None) -> Path:
    """Construit le rapport HTML d'évaluation et retourne son chemin."""
    bundle = joblib.load(model_path)
    model = bundle["model"]
    builder = bundle["feature_builder"]
    label_encoder = bundle["label_encoder"]
    classes = list(bundle["classes"])
    meta = bundle.get("metadata", {})
    random_state = int(meta.get("random_state", 42))

    ds_path = dataset or Path(meta.get("dataset", data_mod.DEFAULT_DATASET))
    df = data_mod.load_dataset(ds_path)
    y = df[data_mod.LABEL_COL]
    _, _, test_idx = data_mod.make_splits(len(df), y, random_state=random_state)
    df_test = df.iloc[test_idx]
    x_test = builder.transform(df_test)
    y_true = label_encoder.transform(y.iloc[test_idx])

    proba = model.predict_proba(x_test)
    preds = proba.argmax(axis=1)
    cm = confusion_matrix(y_true, preds, labels=range(len(classes)))

    # ROC binaire « erreur vs propre ». Gardée pour le cas dégénéré où le jeu
    # (ex. --dataset arbitraire) ne contient qu'une seule classe binaire :
    # roc_curve/roc_auc_score lèveraient sinon (cf. garde équivalente côté
    # train_xgboost._evaluate).
    none_idx = classes.index(data_mod.CLEAN_LABEL) if data_mod.CLEAN_LABEL in classes else 0
    p_error = 1.0 - proba[:, none_idx]
    y_bin = (y_true != none_idx).astype(int)
    binary_ok = len(np.unique(y_bin)) == 2
    auc = float(roc_auc_score(y_bin, p_error)) if binary_ok else float("nan")

    # Reconstruit le tableau par-classe à partir du rapport sklearn.
    from sklearn.metrics import classification_report

    rep = classification_report(
        y_true,
        preds,
        labels=range(len(classes)),
        target_names=classes,
        output_dict=True,
        zero_division=0,
    )
    per_class = {
        c: {
            "precision": rep[c]["precision"],
            "recall": rep[c]["recall"],
            "f1": rep[c]["f1-score"],
            "support": int(rep[c]["support"]),
        }
        for c in classes
        if c in rep
    }

    svg_cm = _svg_confusion(cm, classes)
    if binary_ok:
        fpr, tpr, _ = roc_curve(y_bin, p_error)
        svg_roc = _svg_roc(fpr, tpr, auc)
        svg_hist = _svg_score_hist(p_error[y_bin == 0], p_error[y_bin == 1])
    else:
        _placeholder = (
            '<p class="muted">Non disponible : le jeu de test ne contient '
            "qu'une seule classe binaire (erreur vs propre).</p>"
        )
        svg_roc = svg_hist = _placeholder
    auc_display = f"{auc:.4f}" if binary_ok else "n/a"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    doc = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Rapport d'évaluation — {html.escape(meta.get("model_name", model_path.stem))}</title>
<style>
  body {{ font-family: system-ui, sans-serif; color:#0f172a; max-width:980px; margin:2rem auto; padding:0 1rem; }}
  h1 {{ color:{_C_PRIMARY}; }} h2 {{ border-bottom:2px solid {_C_GRID}; padding-bottom:.3rem; margin-top:2rem; }}
  table {{ border-collapse:collapse; width:100%; margin:.5rem 0; font-size:14px; }}
  th,td {{ border:1px solid {_C_GRID}; padding:.4rem .6rem; text-align:right; }}
  th:first-child, td:first-child {{ text-align:left; }}
  .kpis {{ display:flex; gap:1rem; flex-wrap:wrap; }}
  .kpi {{ background:#f8fafc; border:1px solid {_C_GRID}; border-radius:8px; padding:.8rem 1.2rem; }}
  .kpi b {{ display:block; font-size:1.6rem; color:{_C_PRIMARY}; }}
  .muted {{ color:#64748b; font-size:13px; }}
</style></head><body>
<h1>Rapport d'évaluation — {html.escape(meta.get("model_name", model_path.stem))}</h1>
<p class="muted">Généré le {now} · modèle : <code>{html.escape(str(model_path))}</code> ·
dataset : <code>{html.escape(str(ds_path))}</code> · jeu de test : {len(test_idx)} lignes</p>

<h2>Indicateurs clés (jeu de test)</h2>
<div class="kpis">
  <div class="kpi"><b>{auc_display}</b>AUC-ROC binaire (erreur vs propre)</div>
  <div class="kpi"><b>{rep["weighted avg"]["f1-score"]:.4f}</b>F1 pondéré</div>
  <div class="kpi"><b>{rep["accuracy"]:.4f}</b>Exactitude</div>
  <div class="kpi"><b>{len(classes)}</b>Classes</div>
</div>

<h2>Matrice de confusion</h2>
{svg_cm}

<h2>Courbe ROC (binaire)</h2>
{svg_roc}

<h2>Distribution des scores P(erreur)</h2>
{svg_hist}

<h2>Précision / rappel par type d'erreur</h2>
{_per_class_table(per_class)}

<p class="muted">⚠️ Dataset synthétique : séparabilité élevée. Les performances réelles
RAVEC seront inférieures (cf. notes des métadonnées du modèle).</p>
</body></html>"""

    out = output or (data_mod.EVALUATION_DIR / f"report_{model_path.stem}.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(doc, encoding="utf-8")
    return out


def main(argv: list[str] | None = None) -> int:
    """Point d'entrée CLI."""
    data_mod.configure_console()
    args = parse_args(argv)
    out = build_report(args.model, args.dataset, args.output)
    print(f"✅ Rapport généré : {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
