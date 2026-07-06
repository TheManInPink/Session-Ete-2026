"""
Ingénierie de variables pour la détection d'erreurs de saisie NINA.

``FeatureBuilder`` suit le contrat scikit-learn ``fit`` / ``transform`` :

- ``fit(df)``       apprend des **référentiels** depuis le jeu d'entraînement
  uniquement (noms canoniques, codes Soundex, table région↔code). Cela évite
  toute fuite : les jeux val/test n'influencent jamais ces référentiels.
- ``transform(df)`` produit une matrice numérique de variables, dans un ordre
  de colonnes **stable** — y compris pour une seule ligne (chemin d'inférence
  côté ``ai-service``).

Familles de variables (cf. PROMPT 4.3) :

1. **Lexicales**   — longueur, ratio de voyelles, apostrophe, lettres doublées…
2. **Cohérence**   — sexe/année/mois/région du NINA vs champs ; lettre de contrôle.
3. **Fuzziness**   — Jaro-Winkler vs référentiel de noms ; correspondance Soundex.
4. **Géographiques** — validité des codes, accord région↔code, complétude.
5. **OCR**         — confiance Tesseract par champ **si** des colonnes ``ocr_*``
   sont présentes ; valeurs neutres sinon.

L'objet est sérialisé (joblib) avec le modèle pour reproduire à l'identique les
variables au moment de l'inférence.

Auteur : Étudiant UQAR — NINA-AES Platform
Date    : 2026
"""

from __future__ import annotations

from collections import Counter

import jellyfish
import numpy as np
import pandas as pd
from rapidfuzz import process
from rapidfuzz.distance import JaroWinkler

from . import nina as nina_utils
from .data import REQUIRED_TEXT_COLUMNS

# Voyelles (latines + variantes accentuées fréquentes dans les noms maliens
# translittérés : fr/bambara/peul/songhaï/tamasheq/soninké).
_VOWELS = set("aeiouyàâäáãéèêëíîïóôöõùûüúœæ")

# Taille maximale du référentiel de noms interrogé en Jaro-Winkler (perf : on ne
# garde que les noms les plus fréquents, qui captent l'essentiel des « bonnes »
# orthographes). Au-delà, le gain marginal de rappel ne justifie pas le coût.
_MAX_REF_NAMES = 4000

# Bornes de plausibilité de l'année de naissance (indépendantes du temps : on ne
# peut naître dans le futur ; borne haute = année courante du projet, 2026).
# On émet un drapeau booléen `birth_year_implausible` plutôt qu'une année brute,
# pour éviter d'injecter un biais d'âge ou une dépendance d'échelle dans le modèle.
_MIN_PLAUSIBLE_BIRTH_YEAR = 1900
_MAX_PLAUSIBLE_BIRTH_YEAR = 2026


def _canon_region(value: object) -> str:
    """Canonicalise un code région pour une comparaison robuste (train ↔ inférence JSON).

    Gère les flottants JSON (``1.0`` → ``"1"``) et les zéros de tête (``"01"`` → ``"1"``),
    afin que ``nina_region_match`` et ``region_code_valid`` restent cohérents quelle
    que soit la sérialisation de l'appelant.

    ⚠️ Le NINA encode la région sur **1 chiffre** (régions 1-9 héritées) ; les codes
    ≥ 10 (Taoudénit, Ménaka — réforme 2023) ne peuvent structurellement pas y
    correspondre. Cette limite suit le format NINA de ``packages/utils/nina.ts``.
    """
    v = str(value).strip()
    if v.endswith(".0"):
        v = v[:-2]
    return v.lstrip("0") or v


def _vowel_ratio(name: str) -> float:
    """Ratio de voyelles parmi les lettres d'un nom (0 si aucune lettre)."""
    letters = [c for c in name.lower() if c.isalpha()]
    if not letters:
        return 0.0
    return sum(c in _VOWELS for c in letters) / len(letters)


def _max_consonant_run(name: str) -> int:
    """Longueur de la plus longue suite de consonnes (signal d'anomalie phonétique)."""
    best = run = 0
    for c in name.lower():
        if c.isalpha() and c not in _VOWELS:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


def _has_double_letter(name: str) -> int:
    """1 s'il existe deux lettres identiques consécutives (signal de typo)."""
    low = name.lower()
    return int(any(low[i] == low[i + 1] and low[i].isalpha() for i in range(len(low) - 1)))


def _non_alpha_ratio(name: str) -> float:
    """Ratio de caractères non alphabétiques (hors espace) dans le nom."""
    stripped = name.replace(" ", "")
    if not stripped:
        return 0.0
    return sum(not c.isalpha() for c in stripped) / len(stripped)


def _safe_soundex(name: str) -> str:
    """Soundex robuste : chaîne vide si le nom est vide ou non encodable."""
    if not name:
        return ""
    try:
        return jellyfish.soundex(name)
    except Exception:  # noqa: BLE001 — jellyfish peut lever sur entrée exotique
        return ""


class FeatureBuilder:
    """Constructeur de variables avec apprentissage de référentiels (fit/transform)."""

    def __init__(self, max_ref_names: int = _MAX_REF_NAMES) -> None:
        """Initialise le constructeur.

        Args:
            max_ref_names: Taille maximale du référentiel de noms interrogé en
                Jaro-Winkler (les ``N`` noms les plus fréquents par champ).
        """
        self.max_ref_names = max_ref_names
        self.fitted_ = False
        # Référentiels appris (peuplés par ``fit``).
        self.first_ref_: list[str] = []
        self.last_ref_: list[str] = []
        self.first_ref_set_: set[str] = set()
        self.last_ref_set_: set[str] = set()
        self.first_soundex_: set[str] = set()
        self.last_soundex_: set[str] = set()
        self.region_name_by_code_: dict[str, str] = {}
        self.valid_region_codes_: set[str] = set()
        self.ocr_columns_: list[str] = []
        self.feature_names_: list[str] = []

    # ──────────────────────────────────────────────────────────────────────
    #  fit
    # ──────────────────────────────────────────────────────────────────────
    def fit(self, df: pd.DataFrame) -> "FeatureBuilder":
        """Apprend les référentiels depuis le **jeu d'entraînement** uniquement.

        Args:
            df: DataFrame d'entraînement normalisé (cf. :func:`training.data.load_dataset`).

        Returns:
            ``self`` (chaînage scikit-learn).
        """
        # Référentiel de noms : les orthographes les plus fréquentes sur les
        # lignes SANS erreur de nom sont considérées « canoniques ». On filtre
        # les lignes dont l'erreur porte sur le nom pour ne pas polluer la
        # référence avec des fautes.
        clean_mask = ~df["label"].isin(
            {"typo_substitution", "typo_omission", "typo_insertion", "phonetic_spelling"}
        )
        self.first_ref_, self.first_ref_set_, self.first_soundex_ = self._build_name_ref(
            df.loc[clean_mask, "first_name"]
        )
        self.last_ref_, self.last_ref_set_, self.last_soundex_ = self._build_name_ref(
            df.loc[clean_mask, "last_name"]
        )

        # Table région↔code par vote majoritaire sur les lignes géographiquement
        # cohérentes (label != geographic_mismatch).
        geo_ok = df.loc[df["label"] != "geographic_mismatch"]
        self.region_name_by_code_ = self._build_region_map(geo_ok)
        self.valid_region_codes_ = set(self.region_name_by_code_.keys())

        # Détection de colonnes OCR optionnelles (ex. ``ocr_conf_first_name``).
        self.ocr_columns_ = [
            c for c in df.columns if c.lower().startswith("ocr_") or c.lower().endswith("_ocr_conf")
        ]

        self.fitted_ = True
        # Fige l'ordre des colonnes en transformant un échantillon minimal.
        self.feature_names_ = list(self.transform(df.head(1)).columns)
        return self

    def _build_name_ref(self, series: pd.Series) -> tuple[list[str], set[str], set[str]]:
        """Construit (liste fréquentielle, ensemble exact, ensemble Soundex) d'un champ nom."""
        counts = Counter(n.strip().lower() for n in series if isinstance(n, str) and n.strip())
        ref = [name for name, _ in counts.most_common(self.max_ref_names)]
        ref_set = set(ref)
        soundex_set = {sx for name in ref_set if (sx := _safe_soundex(name))}
        return ref, ref_set, soundex_set

    @staticmethod
    def _build_region_map(df: pd.DataFrame) -> dict[str, str]:
        """Construit la table ``region_code -> nom de région`` par vote majoritaire.

        La canonicalisation a lieu AVANT le ``groupby`` : ainsi des formes brutes
        distinctes mais équivalentes (``"1"`` et ``"01"``) fusionnent dans un même
        vote majoritaire au lieu de s'écraser mutuellement dans le dictionnaire
        (cohérent avec les comparaisons _coherence_features / _geographic_features).
        """
        mapping: dict[str, str] = {}
        if "region_code" not in df.columns or "birth_region" not in df.columns:
            return mapping
        canon = df["region_code"].map(_canon_region)
        for code, group in df.groupby(canon):
            if not code:
                continue
            names = [n.strip() for n in group["birth_region"] if isinstance(n, str) and n.strip()]
            if names:
                mapping[code] = Counter(names).most_common(1)[0][0]
        return mapping

    # ──────────────────────────────────────────────────────────────────────
    #  transform
    # ──────────────────────────────────────────────────────────────────────
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Produit la matrice de variables numériques.

        Args:
            df: DataFrame normalisé (1..N lignes).

        Returns:
            DataFrame de variables ``float`` indexé comme ``df``, colonnes dans
            l'ordre figé par :meth:`fit`.

        Raises:
            RuntimeError: Si appelé avant :meth:`fit`.
        """
        if not self.fitted_:
            raise RuntimeError("FeatureBuilder.transform() appelé avant fit().")

        # Auto-défense : transform doit être AUTONOME (c'est le contrat d'inférence
        # côté ai-service). On garantit la présence des colonnes textuelles requises
        # (créées vides si absentes) — source unique REQUIRED_TEXT_COLUMNS, partagée
        # avec data.load_dataset et ai-service, pour éviter toute dérive.
        df = df.copy()
        for col in REQUIRED_TEXT_COLUMNS:
            if col not in df.columns:
                df[col] = ""
            df[col] = df[col].fillna("").astype(str)

        feats: dict[str, np.ndarray] = {}

        # ── 1. Variables lexicales (first_name + last_name) ─────────────────
        for prefix, col in (("fn", "first_name"), ("ln", "last_name")):
            s = df[col].fillna("").astype(str)
            feats[f"{prefix}_len"] = s.str.len().to_numpy(dtype=float)
            feats[f"{prefix}_vowel_ratio"] = s.map(_vowel_ratio).to_numpy(dtype=float)
            feats[f"{prefix}_has_apostrophe"] = s.str.contains("['’]", regex=True).to_numpy(
                dtype=float
            )
            feats[f"{prefix}_double_letter"] = s.map(_has_double_letter).to_numpy(dtype=float)
            feats[f"{prefix}_max_consonant_run"] = s.map(_max_consonant_run).to_numpy(dtype=float)
            feats[f"{prefix}_non_alpha_ratio"] = s.map(_non_alpha_ratio).to_numpy(dtype=float)
            feats[f"{prefix}_has_digit"] = s.str.contains(r"\d", regex=True).to_numpy(dtype=float)
            feats[f"{prefix}_token_count"] = s.str.split().map(len).to_numpy(dtype=float)

        # ── 3. Variables de fuzziness (référentiel de noms) ─────────────────
        fn_known, fn_jw, fn_phon = self._name_fuzzy(
            df["first_name"], self.first_ref_, self.first_ref_set_, self.first_soundex_
        )
        ln_known, ln_jw, ln_phon = self._name_fuzzy(
            df["last_name"], self.last_ref_, self.last_ref_set_, self.last_soundex_
        )
        feats["fn_ref_known"] = fn_known
        feats["fn_ref_jw"] = fn_jw
        feats["fn_phonetic_variant"] = fn_phon
        feats["ln_ref_known"] = ln_known
        feats["ln_ref_jw"] = ln_jw
        feats["ln_phonetic_variant"] = ln_phon

        # ── 2. Variables de cohérence (NINA ↔ champs) ───────────────────────
        coherence = self._coherence_features(df)
        feats.update(coherence)

        # ── 4. Variables géographiques ──────────────────────────────────────
        geo = self._geographic_features(df)
        feats.update(geo)

        # ── 5. Variables OCR (optionnelles) ─────────────────────────────────
        ocr = self._ocr_features(df)
        feats.update(ocr)

        out = pd.DataFrame(feats, index=df.index).astype(float)
        out = out.replace([np.inf, -np.inf], 0.0).fillna(0.0)

        # Ordre de colonnes stable une fois ``fit`` exécuté.
        if self.feature_names_:
            out = out.reindex(columns=self.feature_names_, fill_value=0.0)
        return out

    def _name_fuzzy(
        self,
        series: pd.Series,
        ref_list: list[str],
        ref_set: set[str],
        soundex_set: set[str],
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Calcule (connu, similarité Jaro-Winkler max, variante phonétique) par nom.

        Optimisation : le calcul Jaro-Winkler se fait sur les noms **uniques** du
        lot puis est ré-étalé, ce qui évite de ré-interroger le référentiel pour
        des noms répétés.
        """
        s = series.fillna("").astype(str).str.strip().str.lower()
        uniques = s.unique()
        known_map: dict[str, float] = {}
        jw_map: dict[str, float] = {}
        phon_map: dict[str, float] = {}

        for name in uniques:
            is_known = name in ref_set
            known_map[name] = 1.0 if is_known else 0.0
            if is_known:
                jw_map[name] = 1.0
            elif name and ref_list:
                match = process.extractOne(name, ref_list, scorer=JaroWinkler.normalized_similarity)
                jw_map[name] = float(match[1]) if match else 0.0
            else:
                jw_map[name] = 0.0
            sx = _safe_soundex(name)
            phon_map[name] = 1.0 if (not is_known and sx and sx in soundex_set) else 0.0

        return (
            s.map(known_map).to_numpy(dtype=float),
            s.map(jw_map).to_numpy(dtype=float),
            s.map(phon_map).to_numpy(dtype=float),
        )

    def _coherence_features(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        """Variables de cohérence interne NINA ↔ champs déclarés.

        La validité de la date est calculée **indépendamment** de celle du NINA
        (un NINA corrompu ne doit pas masquer une date par ailleurs valide). Les
        comparaisons croisées (année/mois NINA ↔ date) requièrent les deux.
        """
        n = len(df)
        valid_format = np.zeros(n)
        checksum_ok = np.zeros(n)
        sex_match = np.zeros(n)
        year_match = np.zeros(n)
        month_match = np.zeros(n)
        region_match = np.zeros(n)
        date_parseable = np.zeros(n)
        year_implausible = np.zeros(n)

        nina_arr = df["nina"].to_numpy()
        sex_arr = df["sex"].to_numpy()
        bdate_arr = df["birth_date"].to_numpy()
        rcode_arr = df["region_code"].to_numpy()

        for i in range(n):
            # ── Date (indépendante du NINA), attendue en ISO ``YYYY-MM-DD`` ──
            bd = str(bdate_arr[i]).strip()
            bd_year = bd_month = None
            if len(bd) >= 10 and bd[4] == "-" and bd[7] == "-":
                yyyy, mm = bd[0:4], bd[5:7]
                if yyyy.isdigit() and mm.isdigit():
                    date_parseable[i] = 1.0
                    bd_year, bd_month = yyyy, mm
                    year_val = int(yyyy)
                    if not (_MIN_PLAUSIBLE_BIRTH_YEAR <= year_val <= _MAX_PLAUSIBLE_BIRTH_YEAR):
                        year_implausible[i] = 1.0

            # ── NINA (format, checksum, sexe, région) ──────────────────────
            parsed = nina_utils.try_parse_nina(nina_arr[i])
            if parsed is not None:
                valid_format[i] = 1.0
                checksum_ok[i] = 1.0 if nina_utils.validate_nina(nina_arr[i]) else 0.0
                sx = str(sex_arr[i]).strip().upper()
                if (parsed.sexe == 1 and sx == "M") or (parsed.sexe == 2 and sx == "F"):
                    sex_match[i] = 1.0
                if _canon_region(rcode_arr[i]) == _canon_region(parsed.region):
                    region_match[i] = 1.0
                # ── Croisements NINA ↔ date (nécessitent les deux) ──────────
                if bd_year is not None and bd_year[2:4] == parsed.annee_naissance:
                    year_match[i] = 1.0
                if bd_month is not None and bd_month == parsed.mois_naissance:
                    month_match[i] = 1.0

        return {
            "nina_valid_format": valid_format,
            "nina_checksum_ok": checksum_ok,
            "nina_sex_match": sex_match,
            "nina_year_match": year_match,
            "nina_month_match": month_match,
            "nina_region_match": region_match,
            "birth_date_parseable": date_parseable,
            "birth_year_implausible": year_implausible,
        }

    def _geographic_features(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        """Variables de validité et de cohérence géographiques."""
        # Canonicalisation cohérente avec nina_region_match (robuste aux codes
        # JSON-typés "1.0" / zéro-padés "01" reçus à l'inférence).
        rcode = df["region_code"].map(_canon_region)
        bregion = df["birth_region"].fillna("").astype(str).str.strip()

        code_valid = rcode.isin(self.valid_region_codes_).to_numpy(dtype=float)
        expected = rcode.map(self.region_name_by_code_)
        region_name_match = (expected.fillna("") == bregion).to_numpy(dtype=float)

        return {
            "region_code_valid": code_valid,
            "region_name_match": region_name_match,
            "cercle_present": (
                df["cercle"].fillna("").astype(str).str.strip().ne("").to_numpy(dtype=float)
            ),
            "commune_present": (
                df["commune"].fillna("").astype(str).str.strip().ne("").to_numpy(dtype=float)
            ),
            "village_present": (
                df["village"].fillna("").astype(str).str.strip().ne("").to_numpy(dtype=float)
            ),
        }

    def _ocr_features(self, df: pd.DataFrame) -> dict[str, np.ndarray]:
        """Variables de confiance OCR (si colonnes ``ocr_*`` présentes, sinon neutres)."""
        n = len(df)
        present = [c for c in self.ocr_columns_ if c in df.columns]
        if present:
            block = df[present].apply(pd.to_numeric, errors="coerce")
            return {
                "ocr_available": np.ones(n),
                "ocr_mean_conf": block.mean(axis=1).fillna(1.0).to_numpy(dtype=float),
                "ocr_min_conf": block.min(axis=1).fillna(1.0).to_numpy(dtype=float),
            }
        # Pas d'OCR : confiance neutre haute (1.0) → variable non discriminante.
        return {
            "ocr_available": np.zeros(n),
            "ocr_mean_conf": np.ones(n),
            "ocr_min_conf": np.ones(n),
        }

    # ──────────────────────────────────────────────────────────────────────
    #  Confort
    # ──────────────────────────────────────────────────────────────────────
    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Enchaîne :meth:`fit` puis :meth:`transform` sur le même DataFrame."""
        return self.fit(df).transform(df)
