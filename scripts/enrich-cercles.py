#!/usr/bin/env python3
"""
scripts/enrich-cercles.py — Enrichissement de data/mali/cercles.json

OBJECTIF
────────
Compléter les ~94 cercles manquants du référentiel NINA-AES en scrappant
la page Wikipédia FR « Cercles du Mali » puis en géocodant chaque cercle
inconnu via Nominatim (OpenStreetMap, libre, sans clé API).

STRATÉGIE
─────────
1. Source canonique = `data/mali/cercles.json` (64 entrées, nom + region_code
   + centroïde + confiance).
2. La page Wikipédia FR `https://fr.wikipedia.org/wiki/Cercles_du_Mali`
   liste les cercles, parfois regroupés par région.
3. Pour chaque cercle Wikipédia introuvable dans le JSON (matching par nom
   normalisé NFD + lowercase + suppression espaces/tirets/apostrophes) :
     a) Tenter le rattachement régional via le contexte de la table source.
     b) Géocoder le nom via Nominatim avec contrainte `countrycodes=ml`.
     c) Si géocode OK : ajouter avec `confiance: "moyenne"` + `estime: true`.
     d) Si géocode KO : ajouter avec coordonnées 0,0 + `confiance: "basse"`
        pour signaler l'enrichissement manuel ultérieur.
4. La fusion est **non destructive** : aucune entrée existante n'est modifiée.
5. **Dry-run par défaut** : aucun fichier n'est écrit sans `--write`.

PRÉREQUIS
─────────
    pip install -r scripts/requirements-enrich.txt
    # Dépendances : requests, beautifulsoup4
    # (parser : lxml si disponible, sinon html.parser builtin Python)

POLITESSE NETWORK
─────────────────
- Wikipedia : 1 seule requête (HTML mis en cache local 24h dans /tmp).
- Nominatim : 1 requête / seconde maximum (politique OSM officielle),
  User-Agent identifiable obligatoire.

USAGE
─────
    # Dry-run : affiche le diff sans rien écrire
    python scripts/enrich-cercles.py

    # Appliquer (écrit data/mali/cercles.json)
    python scripts/enrich-cercles.py --write

    # Verbose + cache HTML personnalisé
    python scripts/enrich-cercles.py --verbose --cache-dir .cache/

    # Ne pas géocoder (offline, ajoute confiance: basse)
    python scripts/enrich-cercles.py --no-geocode

AUTEUR
──────
NINA-AES Platform — mai 2026
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as exc:
    sys.stderr.write(
        "❌ Dépendances manquantes. Installe-les via :\n"
        "    pip install -r scripts/requirements-enrich.txt\n"
        f"   (détail : {exc})\n"
    )
    sys.exit(2)

# Parser BeautifulSoup : lxml (rapide, optionnel) ou html.parser (builtin Python).
# On sonde avec find_spec pour éviter un vrai import (sinon ruff F401 / Pyright
# "unresolved" si le package est absent de l'env).
from importlib.util import find_spec

BS_PARSER = "lxml" if find_spec("lxml") is not None else "html.parser"

# ─── Configuration ──────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "mali"
REGIONS_FILE = DATA_DIR / "regions.json"
CERCLES_FILE = DATA_DIR / "cercles.json"

WIKIPEDIA_URL = "https://fr.wikipedia.org/wiki/Cercles_du_Mali"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

USER_AGENT = (
    "NINA-AES-Enrich/1.0 (https://github.com/nina-aes-platform; "
    "projet universitaire UQAR, partenariat CTDEC Mali)"
)

# Délai minimum entre 2 requêtes Nominatim (politique OSM : ≤ 1 req/s)
NOMINATIM_DELAY_SEC = 1.1

# TTL du cache HTML Wikipédia (24 h)
WIKI_CACHE_TTL_SEC = 86_400

logger = logging.getLogger("enrich-cercles")


# ─── Modèle de données ──────────────────────────────────────────────────────


@dataclass
class Region:
    code: str
    nom_court: str
    nom_officiel: str


@dataclass
class CercleCandidate:
    """Cercle extrait de Wikipédia, candidat à l'ajout."""

    nom: str
    region_label: Optional[str]  # nom de région tel qu'apparu sur Wikipédia
    region_code: Optional[str]  # résolu après mapping
    lat: Optional[float] = None
    lng: Optional[float] = None
    geocode_source: Optional[str] = None  # "nominatim" | "wikipedia-link" | None


# ─── Helpers ────────────────────────────────────────────────────────────────


def normalize(name: str) -> str:
    """Normalise un nom pour comparaison : NFD, lowercase, supprime tirets/espaces/apostrophes."""
    decomposed = unicodedata.normalize("NFD", name)
    no_accents = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"[-\s'’]+", "", no_accents.lower())


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fp:
        return json.load(fp)


def save_json(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
        fp.write("\n")


# ─── Étape 1 : charger les référentiels existants ──────────────────────────


def load_regions() -> dict[str, Region]:
    """Index des régions par nom normalisé."""
    data = load_json(REGIONS_FILE)
    out: dict[str, Region] = {}
    for r in data["regions"]:
        region = Region(
            code=r["code"],
            nom_court=r["nom_court"],
            nom_officiel=r["nom_officiel"],
        )
        out[normalize(region.nom_court)] = region
        out[normalize(region.nom_officiel)] = region
    return out


def load_cercles_known() -> tuple[dict, set[str]]:
    """Retourne (raw_json, ensemble des noms normalisés déjà présents)."""
    data = load_json(CERCLES_FILE)
    known = {normalize(c["nom"]) for c in data["cercles"]}
    return data, known


# ─── Étape 2 : fetch + parse Wikipédia ──────────────────────────────────────


def fetch_wikipedia_html(cache_dir: Path) -> str:
    """Télécharge la page Wikipédia avec cache local 24 h."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / "wikipedia-cercles-du-mali.html"

    if cache_file.exists():
        age = time.time() - cache_file.stat().st_mtime
        if age < WIKI_CACHE_TTL_SEC:
            logger.info("Utilise le cache HTML (%.0fh)", age / 3600)
            return cache_file.read_text(encoding="utf-8")

    logger.info("Téléchargement de %s...", WIKIPEDIA_URL)
    response = requests.get(
        WIKIPEDIA_URL,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    response.raise_for_status()
    html = response.text
    cache_file.write_text(html, encoding="utf-8")
    logger.info("Cache HTML écrit dans %s", cache_file)
    return html


def parse_wikipedia(
    html: str, regions_index: dict[str, Region]
) -> list[CercleCandidate]:
    """
    Extrait les cercles depuis la structure Wikipédia.

    Stratégie (tolérante aux changements de mise en page) :
    - Parcourir tous les <table class="wikitable"> de l'article.
    - Pour chaque table, lire l'en-tête pour repérer les colonnes
      « Cercle / Nom » et « Région ».
    - Si une seule colonne (table groupée par région via <h3>), utiliser
      le dernier <h2>/<h3> rencontré comme contexte régional.
    """
    soup = BeautifulSoup(html, BS_PARSER)
    candidates: list[CercleCandidate] = []
    seen_in_wiki: set[str] = set()

    # Contexte régional courant pour les tables sans colonne « Région »
    current_region_label: Optional[str] = None

    # Parcours en ordre du document pour suivre les headings + tables
    for element in soup.find_all(["h2", "h3", "table"]):
        if element.name in ("h2", "h3"):
            # Extraire le label du heading (sans le « [modifier] » MediaWiki)
            heading = element.get_text(separator=" ", strip=True)
            heading = re.sub(r"\[modifier.*?\]", "", heading).strip()
            # Détecter si ce heading est un nom de région connu
            if normalize(heading) in regions_index:
                current_region_label = heading
                logger.debug("Contexte régional → %s", heading)
            continue

        if "wikitable" not in (element.get("class") or []):
            continue

        # Lire les en-têtes
        header_cells = [
            th.get_text(separator=" ", strip=True).lower()
            for th in element.find_all("th")[:10]  # limite raisonnable
        ]
        col_cercle = _find_column_index(header_cells, ["cercle", "nom"])
        col_region = _find_column_index(header_cells, ["région", "region"])

        for row in element.find_all("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue

            # Si on a une colonne identifiée, l'utiliser ; sinon prendre la première td
            if col_cercle is not None and col_cercle < len(cells):
                name_cell = cells[col_cercle]
            else:
                name_cell = (
                    cells[0]
                    if cells[0].name == "td"
                    else (cells[1] if len(cells) > 1 else None)
                )

            if name_cell is None or name_cell.name != "td":
                continue

            nom = name_cell.get_text(separator=" ", strip=True)
            nom = re.sub(r"\s+", " ", nom).strip(" ·,;")
            if not nom or len(nom) < 2 or nom.lower() in ("cercle", "nom", "région"):
                continue
            # Filtrer les chiffres seuls et notes
            if re.fullmatch(r"\d+", nom) or nom.startswith("("):
                continue
            # Nettoyer le préfixe « Cercle de … » utilisé par Wikipédia
            # (notre JSON garde uniquement le toponyme : "Cercle de Kayes" → "Kayes")
            nom = re.sub(
                r"^cercle\s+(de\s+|du\s+|d['’]\s*)",
                "",
                nom,
                flags=re.IGNORECASE,
            ).strip()
            if not nom:
                continue

            region_label = current_region_label
            if col_region is not None and col_region < len(cells):
                region_text = cells[col_region].get_text(separator=" ", strip=True)
                region_text = re.sub(r"\s+", " ", region_text).strip()
                if region_text:
                    region_label = region_text

            normalized = normalize(nom)
            if normalized in seen_in_wiki:
                continue
            seen_in_wiki.add(normalized)

            region_code = None
            if region_label:
                # Essayer d'extraire un nom de région pur (ex. "Région de Kayes" → "Kayes")
                cleaned = re.sub(
                    r"^(région|district)\s+(de\s+|du\s+|d')\s*",
                    "",
                    region_label,
                    flags=re.IGNORECASE,
                )
                cleaned = cleaned.strip()
                ref = regions_index.get(normalize(cleaned)) or regions_index.get(
                    normalize(region_label)
                )
                if ref:
                    region_code = ref.code

            candidates.append(
                CercleCandidate(
                    nom=nom,
                    region_label=region_label,
                    region_code=region_code,
                )
            )

    return candidates


def _find_column_index(headers: list[str], keywords: list[str]) -> Optional[int]:
    """Retourne l'index de la première colonne dont l'en-tête contient un keyword."""
    for idx, h in enumerate(headers):
        for kw in keywords:
            if kw in h:
                return idx
    return None


# ─── Étape 3 : géocodage Nominatim (politesse 1 req/s) ──────────────────────


class NominatimClient:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._last_call = 0.0

    def geocode(self, place: str) -> Optional[tuple[float, float]]:
        if not self.enabled:
            return None
        # Politesse
        elapsed = time.time() - self._last_call
        if elapsed < NOMINATIM_DELAY_SEC:
            time.sleep(NOMINATIM_DELAY_SEC - elapsed)

        params = {
            "q": place,
            "countrycodes": "ml",
            "format": "json",
            "limit": 1,
            "addressdetails": 0,
        }
        try:
            response = requests.get(
                NOMINATIM_URL,
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept-Language": "fr"},
                timeout=15,
            )
            response.raise_for_status()
            results = response.json()
        except requests.RequestException as exc:
            logger.warning("Nominatim KO pour %r : %s", place, exc)
            return None
        finally:
            self._last_call = time.time()

        if not results:
            return None
        return (float(results[0]["lat"]), float(results[0]["lon"]))


# ─── Étape 4 : fusion non destructive ──────────────────────────────────────


def build_new_entry(
    candidate: CercleCandidate,
    next_seq_by_region: dict[str, int],
) -> Optional[dict]:
    """Construit une entrée cercles.json depuis un candidat enrichi."""
    if not candidate.region_code:
        logger.warning(
            "Ignoré (région non résolue) : %s [%s]",
            candidate.nom,
            candidate.region_label,
        )
        return None

    seq = next_seq_by_region.get(candidate.region_code, 1)
    next_seq_by_region[candidate.region_code] = seq + 1
    code = f"{candidate.region_code}-{seq:02d}"

    has_coord = candidate.lat is not None and candidate.lng is not None
    confiance = "moyenne" if has_coord else "basse"

    return {
        "code": code,
        "nom": candidate.nom,
        "region_code": candidate.region_code,
        "centroide": {
            "lat": candidate.lat or 0.0,
            "lng": candidate.lng or 0.0,
            "estime": True,
        },
        "confiance": confiance,
        "source_enrichissement": "wikipedia+nominatim" if has_coord else "wikipedia",
    }


def compute_next_seq(existing: list[dict]) -> dict[str, int]:
    """Trouve le prochain numéro de séquence par région (max existant + 1)."""
    by_region: dict[str, int] = {}
    for c in existing:
        m = re.match(r"^(ML-\d{2})-(\d{2})$", c["code"])
        if not m:
            continue
        region_code, seq = m.group(1), int(m.group(2))
        by_region[region_code] = max(by_region.get(region_code, 0), seq)
    return {r: n + 1 for r, n in by_region.items()}


# ─── Pipeline ──────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrichit cercles.json depuis Wikipédia FR + Nominatim.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Dry-run par défaut. Passe --write pour appliquer.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Écrit le résultat dans cercles.json (sinon dry-run).",
    )
    parser.add_argument(
        "--no-geocode",
        action="store_true",
        help="Désactive Nominatim (offline). Confiance: basse pour tous les nouveaux.",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=ROOT / ".cache",
        help="Répertoire de cache HTML (défaut : .cache/).",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Logs détaillés.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    logger.info("═══ Enrichissement cercles.json ═══")
    logger.info("Mode : %s", "WRITE" if args.write else "DRY-RUN")
    logger.info(
        "Géocode : %s", "désactivé" if args.no_geocode else "Nominatim (1 req/s)"
    )

    regions_index = load_regions()
    cercles_data, known_norm = load_cercles_known()
    existing_cercles = cercles_data["cercles"]
    distinct_regions = {r.code for r in regions_index.values()}
    logger.info(
        "Référentiel actuel : %d cercles, %d régions",
        len(existing_cercles),
        len(distinct_regions),
    )

    # Fetch + parse
    try:
        html = fetch_wikipedia_html(args.cache_dir)
    except requests.RequestException as exc:
        logger.error("Téléchargement Wikipédia impossible : %s", exc)
        return 1

    candidates = parse_wikipedia(html, regions_index)
    logger.info("Cercles extraits de Wikipédia : %d", len(candidates))

    # Filtrer ceux déjà présents
    new_candidates = [c for c in candidates if normalize(c.nom) not in known_norm]
    logger.info("Nouveaux candidats (absents du JSON) : %d", len(new_candidates))

    # Géocodage
    nominatim = NominatimClient(enabled=not args.no_geocode)
    for cand in new_candidates:
        if cand.region_code is None:
            continue
        result = nominatim.geocode(f"{cand.nom}, Mali")
        if result:
            cand.lat, cand.lng = result
            cand.geocode_source = "nominatim"
            logger.info(
                "✓ %-25s [%s] → (%.4f, %.4f)",
                cand.nom,
                cand.region_code,
                cand.lat,
                cand.lng,
            )
        else:
            logger.info("✗ %-25s [%s] → géocode KO", cand.nom, cand.region_code or "?")

    # Construction des entrées
    # Politique : seuls les candidats GÉOCODÉS sont ajoutés au JSON canonique.
    # Les candidats sans coordonnée sont listés dans le rapport pour enrichissement
    # manuel ultérieur (évite la pollution avec des centroïdes (0,0) qui cassent
    # la bbox du schema JSON Mali).
    next_seq = compute_next_seq(existing_cercles)
    new_entries: list[dict] = []
    skipped_no_region = 0
    skipped_no_geocode: list[str] = []
    for cand in new_candidates:
        if cand.region_code is None:
            skipped_no_region += 1
            continue
        if cand.lat is None or cand.lng is None:
            skipped_no_geocode.append(f"{cand.nom} ({cand.region_code})")
            continue
        entry = build_new_entry(cand, next_seq)
        if entry:
            new_entries.append(entry)

    # Rapport
    print()
    print("═" * 70)
    print("RAPPORT D'ENRICHISSEMENT")
    print("═" * 70)
    print(f"Cercles existants  : {len(existing_cercles)}")
    print(f"Extraits Wikipédia : {len(candidates)}")
    print(f"Déjà connus        : {len(candidates) - len(new_candidates)}")
    print(f"Nouveaux candidats : {len(new_candidates)}")
    print(f"  ↳ ajoutés (géocodés)              : {len(new_entries)}")
    print(f"  ↳ ignorés (région non résolue)    : {skipped_no_region}")
    print(f"  ↳ ignorés (géocode Nominatim KO)  : {len(skipped_no_geocode)}")
    print(
        f"Total final si écrit  : {len(existing_cercles) + len(new_entries)} / 159 attendus"
    )
    print()

    if skipped_no_geocode:
        print(
            f"⚠️  {len(skipped_no_geocode)} cercles sans coordonnée — à enrichir manuellement :"
        )
        for s in skipped_no_geocode:
            print(f"     - {s}")
        print("    Pistes : ajouter manuellement dans cercles.json après vérification")
        print("    d'orthographe (Wikipedia FR), ou attendre la réponse INSTAT")
        print("    (cf. docs/data/instat-data-request.md).")
        print()

    if not new_entries:
        print("Aucune entrée à ajouter. Référentiel à jour.")
        return 0

    # Aperçu des 5 premières entrées
    print("APERÇU (5 premières nouvelles entrées) :")
    for e in new_entries[:5]:
        print(
            f"  {e['code']:<10} {e['nom']:<25} {e['region_code']} "
            f"({e['centroide']['lat']:.3f}, {e['centroide']['lng']:.3f}) "
            f"confiance={e['confiance']}"
        )
    print()

    if args.write:
        merged = cercles_data.copy()
        merged["cercles"] = existing_cercles + new_entries
        merged["metadata"]["total_dans_ce_fichier"] = len(merged["cercles"])
        merged["metadata"]["version"] = time.strftime("%Y.%m.%d")
        save_json(CERCLES_FILE, merged)
        print(f"✅ {CERCLES_FILE} écrit ({len(merged['cercles'])} cercles).")
        print("   Pense à régénérer le SQL :")
        print("     make seed-locations-generate")
        print("     pnpm run verify:repo")
    else:
        print("DRY-RUN : aucun fichier n'a été modifié.")
        print("Pour appliquer : python scripts/enrich-cercles.py --write")

    return 0


if __name__ == "__main__":
    sys.exit(main())
