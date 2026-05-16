# `data/mali/` — Référentiel géographique Mali

Source de vérité des découpages administratifs maliens utilisés par
toutes les apps (citizen, admin, governance) et les services backend.

## Fichiers

### `regions.json`

Liste plate des **20 régions/cercles actuels** (post-réformes 2016 +
2023). Codes au format `ML-NN` (ML-01 à ML-20). Source : compilation
interne basée sur les décrets administratifs récents.

Validé par `scripts/validate-mali-data.mjs` (codes uniques, format
`ML-NN`, chef-lieu présent comme cercle).

### `cercles.json`

64 cercles avec rattachement régional. Validé par le même script.

### `mali.geojson`

55 features **Point** (centroïdes) couvrant pays + régions + chefs-lieux
de cercles. Niveaux :
- `level: 0` → pays (1 feature)
- `level: 1` → régions (20 features)
- `level: 2` → cercles principaux (34 features)

Utilisé par `<MaliHeatmap>` en mode bubble map (fallback).

### `mali-regions-polygons.json` ⭐ (mai 2026)

**FeatureCollection GeoJSON polygons** des 9 régions historiques Mali
pré-2016 + District de Bamako. Couvre 100 % du territoire.

- **Source** : [geoBoundaries](https://www.geoboundaries.org/) gbOpen
  Mali ADM1, version simplified.
- **URL d'origine** :
  `https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/MLI/ADM1/geoBoundaries-MLI-ADM1_simplified.geojson`
- **Licence** : Open Data (geoBoundaries gbOpen).
- **Taille** : ~295 KB (6 700 coords totales, 745 par polygone en
  moyenne).
- **Bbox** : lon -12.24 → +4.25, lat 10.14 → 25.00.

Codes `shapeISO` mappés vers nos codes internes `ML-NN` (cf.
`packages/ui/src/components/charts/mali-heatmap.tsx` constante
`LEGACY_CODE_MAP`) :

| geoBoundaries | Interne (ML-NN) | Nom              |
| ------------- | --------------- | ---------------- |
| `ML-BKO`      | `ML-09`         | District Bamako  |
| `ML-1`        | `ML-01`         | Kayes            |
| `ML-2`        | `ML-02`         | Koulikoro        |
| `ML-3`        | `ML-03`         | Sikasso          |
| `ML-4`        | `ML-04`         | Ségou            |
| `ML-5`        | `ML-05`         | Mopti            |
| `ML-6`        | `ML-06`         | Tombouctou       |
| `ML-7`        | `ML-07`         | Gao              |
| `ML-8`        | `ML-08`         | Kidal            |

**Limite connue** : les 11 régions/cercles créés post-2016 (Taoudénit,
Ménaka, Nioro, Kita, Dioïla, Nara, Bougouni, Koutiala, San, Bandiagara,
Douentza — codes ML-10 à ML-20) ne sont **pas** présents comme
polygones séparés. Ils sont rendus comme petits marqueurs centroïdes
par-dessus la choroplèthe (cf. composant `MaliHeatmap`).

Pour upgrader vers les 20 régions actuelles, sourcer un dataset plus
récent (ex. INSTAT Mali, ou OCHA HDX si publié) puis remplacer ce
fichier.

## Mise à jour

```bash
# Re-télécharger depuis geoBoundaries :
curl -L -o data/mali/mali-regions-polygons.json \
  "https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/MLI/ADM1/geoBoundaries-MLI-ADM1_simplified.geojson"

# Valider la chaîne complète :
pnpm run verify:repo
```

## Artefacts dérivés (générés depuis ces JSON)

Les fichiers suivants sont **régénérés automatiquement** depuis le contenu
ci-dessus — ne pas les éditer à la main :

| Fichier généré                                 | Source            | Régénération                           |
| ---------------------------------------------- | ----------------- | -------------------------------------- |
| `infrastructure/scripts/seed-locations.sql`   | `regions.json` + `cercles.json` | `make seed-locations-generate` |

Le SQL `seed-locations.sql` crée un schéma `geo_ref` dans PostgreSQL
(20 régions + 64 cercles + 10 communes échantillon dans des tables
isolées de `public.locations` géré par Prisma). Il est monté en
`/docker-entrypoint-initdb.d/02-seed-locations.sql` et s'exécute
automatiquement au premier `pnpm docker:up`.

Voir `docs/data/mali-divisions.md §3bis` pour la justification du
double stockage (JSON canonique + SQL dérivé).
