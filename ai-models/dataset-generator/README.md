# `ai-models/dataset-generator` — Générateur de dataset synthétique NINA

> **Bloc** : A (alimente le module IA) · **Statut** : reconstruction fidèle **Sortie** :
> `ai-models/datasets/nina_synthetic_v1.csv` (schéma riche)

Génère un dataset **100 % synthétique** d'enregistrements NINA (aucune donnée réelle de citoyen),
avec injection contrôlée d'erreurs de saisie. C'est la **source de vérité des données** consommée
par [`ai-models/training`](../training/README.md).

> ⚠️ **Reconstruction** : la source d'origine a été perdue (troncature à 0 octet lors d'une
> saturation disque ENOSPC ; seul subsistait le bytecode `__pycache__`). Ce paquet a été ré-écrit
> fidèlement à partir du schéma et des distributions du premier dataset produit. Le référentiel
> (`catalog.json`) a été amorcé depuis ce dataset puis figé comme donnée du paquet.

---

## 1. Installation & usage

```powershell
cd ai-models/dataset-generator
pip install -e .[dev]

# Génère 10 000 lignes (40 % en erreur) — entrypoint utilisé par la CI
python -m dataset_generator.generate --rows 10000 --output ../datasets/nina_synthetic_v1.csv

# Valide les invariants d'un dataset
python -m dataset_generator.validate ../datasets/nina_synthetic_v1.csv

# Exporte le référentiel géographique en JSON
python -m dataset_generator.export_reference --output ../datasets/reference_geo.json

# Tests
pytest tests/ -v
```

Alias console après installation : `nina-generate`, `nina-validate`, `nina-export-reference`.

---

## 2. Schéma produit (16 colonnes)

`nina, last_name, first_name, birth_date, sex, region_code, birth_region, cercle, commune, village, father_name, mother_name, language, has_error, error_type, error_field`

- **NINA valide** sur les lignes propres (lettre de contrôle mod 23, chiffre région = `region_code`,
  sexe/année/mois cohérents).
- **`error_type`** ∈ taxonomie alignée sur `ai-models/training` : `typo_substitution`,
  `typo_omission`, `typo_insertion`, `phonetic_spelling`, `field_inversion`, `geographic_mismatch`,
  `date_format_error`, `invalid_checksum`.
- **`error_field`** : champ(s) impacté(s) ; multi-valeur `first_name,last_name` pour
  `field_inversion` (échappé entre guillemets par le CSV).

---

## 3. Architecture du paquet

| Module                | Rôle                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `nina.py`             | Construction de NINA valides + corruption de checksum (port de `nina.ts`).                  |
| `catalog.py`          | Chargement du référentiel embarqué `catalog.json` (régions 1-9, géo, noms, langues, poids). |
| `mutators.py`         | Un mutateur par type d'erreur (signature `(record, rng, catalog) -> error_field`).          |
| `generate.py`         | Orchestration + CLI : lignes propres → injection d'erreurs pondérées → CSV.                 |
| `validate.py`         | Invariants de cohérence (CLI + utilisé par les tests).                                      |
| `export_reference.py` | Export JSON du référentiel géographique.                                                    |

Reproductible : `--seed` fixe l'aléa (NumPy `default_rng`).

---

## 4. Régions NINA héritées (1 chiffre)

| Code | Région    | Code | Région     |
| ---- | --------- | ---- | ---------- |
| 1    | Kayes     | 6    | Tombouctou |
| 2    | Koulikoro | 7    | Gao        |
| 3    | Sikasso   | 8    | Kidal      |
| 4    | Ségou     | 9    | Bamako     |
| 5    | Mopti     |      |            |

> Le format NINA encode la région sur **1 chiffre** (héritage RAVEC). Les régions post-réforme 2023
> (Taoudénit, Ménaka… codes ≥ 10) ne sont pas représentables dans ce champ — cf. note dans
> `ai-models/training/features.py::_canon_region`.

---

_NINA-AES Platform — UQAR — Générateur synthétique v1.0 — 2026_
