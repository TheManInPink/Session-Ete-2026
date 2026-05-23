# Divisions administratives du Mali — Référentiel NINA-AES

> **Version** : 2026.05.03 **Statut** : Référentiel officiel du projet · 19 régions + District de
> Bamako **Pays couvert** : République du Mali (ISO 3166-1 alpha-3 : **MLI**)

Ce document est la **source unique de vérité** pour la hiérarchie administrative du Mali utilisée
par la plateforme NINA-AES (frontend, backend, base de données, IA). Il accompagne les fichiers
`data/mali/regions.json`, `data/mali/cercles.json` et `data/mali/mali.geojson`.

---

## 1. Hiérarchie administrative officielle

Selon la **Loi N°2023-001 du 13 mars 2023** portant organisation territoriale de la République du
Mali, le pays est structuré sur **8 niveaux** (alignés sur le modèle `Location` de notre schéma
Prisma, cf. `packages/database/prisma/schema.prisma`) :

| Niveau | Type              | Total officiel | Statut dans NINA-AES                                               |
| ------ | ----------------- | -------------: | ------------------------------------------------------------------ |
| 0      | Pays              |              1 | ✅ Complet (1 entrée : Mali)                                       |
| 1      | Région            |             19 | ✅ Complet (19 régions + District de Bamako = 20)                  |
| 2      | Cercle            |        **159** | ⚠️ **142/159 (89 %)** — enrichi mai 2026 via Wikipedia + Nominatim |
| 3      | Arrondissement    |            466 | ❌ Structure prête, données à ingérer                              |
| 4      | Commune           |        **819** | ⚠️ Communes urbaines de Bamako présentes (6/819)                   |
| 5      | Quartier          |              — | ❌ À ingérer au cas par cas                                        |
| 6      | Village           |     **12 712** | ❌ Hors scope V1 — ingestion future via INSTAT Mali                |
| 7      | Hameau / fraction |              — | ❌ Hors scope                                                      |

**Total niveau 1 = 20 entités** : 19 régions au sens strict + le District autonome de Bamako (qui
n'est juridiquement pas une région mais est traité comme niveau 1 pour la cohérence du modèle de
données — il joue le rôle de capitale fédérée).

---

## 2. Sources et politique de citation

### 2.1 Sources primaires (faisant foi)

1. **Loi N°2023-001 du 13 mars 2023** — texte législatif fondateur de l'actuelle organisation à 19
   régions. Source officielle : Journal Officiel de la République du Mali.
2. **Ministère de l'Administration Territoriale et de la Décentralisation (MATD)** —
   <https://www.facebook.com/matdmali/> <https://www.matcl.gov.ml/> (référentiel administratif
   gouvernemental).
3. **Institut National de la Statistique du Mali (INSTAT)** — <https://www.instat-mali.org>
   (recensements RGPH, listes de villages).

### 2.2 Sources secondaires (utilisées pour ce projet)

1. **Wikipédia FR — Régions du Mali** : <https://fr.wikipedia.org/wiki/R%C3%A9gions_du_Mali>
2. **Wikipédia FR — Cercles du Mali** : <https://fr.wikipedia.org/wiki/Cercles_du_Mali>
3. **UN OCHA — HDX Mali Common Operational Datasets** :
   <https://data.humdata.org/organization/ocha-mali> <https://response.reliefweb.int/mali>
   (shapefiles administratifs avec polygones officiels en projection WGS84).
4. **GeoNames Mali** : <https://www.geonames.org/search.html?q=Mali&country=> (coordonnées de
   chefs-lieux).

### 2.3 Politique de citation

- **Toute donnée** dans `regions.json` / `cercles.json` qui ne provient pas directement d'une source
  primaire est marquée par `"estime": true` ou `"confiance": "moyenne"` / `"basse"`.
- **Aucune division administrative n'est inventée**. Si un cercle n'est pas dans les données
  ouvertes, il est listé dans `cercles.json` → `cercles_a_enrichir` comme à compléter, jamais inséré
  avec un nom fabriqué.

---

## 3. État de complétude et stratégie d'enrichissement

### 3.1 Régions (niveau 1) — ✅ 20/20

Toutes les régions et le district sont présents dans `regions.json` avec :

- Nom officiel + nom court
- Chef-lieu
- Centroïde (lat/lng) basé sur le chef-lieu
- Date de création / statut post-2023
- Langues principales pratiquées (cf. `Language` enum dans `@nina-aes/shared-types`)

**Aucune lacune.** Coordonnées vérifiées contre GeoNames pour les chefs-lieux.

### 3.2 Cercles (niveau 2) — ⚠️ 142 noms / 50 polygones / 159 attendus

#### 3.2.1 Données nominales (`cercles.json`)

Le fichier `cercles.json` contient **142 cercles** (vs 64 avant mai 2026) :

- **64 entrées initiales** (haute confiance) : structure pré-2023 (53 cercles historiques) augmentée
  des cercles confirmés des nouvelles régions (Taoudénit, Ménaka, Bandiagara, Bougouni, Koutiala,
  San, Douentza, Nara, Dioïla, Nioro, Kita), plus les 6 communes urbaines de Bamako traitées comme
  cercles.
- **78 entrées enrichies** (moyenne confiance, mai 2026) : ajoutées automatiquement via
  `scripts/enrich-cercles.py` qui scrappe Wikipédia FR puis géocode chaque cercle via Nominatim
  (OpenStreetMap). Coordonnées estimées (`estime: true`), source flaggée `wikipedia+nominatim` dans
  le champ `source_enrichissement`.

**7 cercles restants** (Toguéré-Coumbé, Achibogho, Anétif, Timétrine, Takalote, Inlamawane,
Dialassagou) n'ont pas pu être géocodés (orthographe absente d'OSM ou variante locale) — listés dans
le rapport du script, à enrichir manuellement ou via INSTAT (cf. `instat-data-request.md`).

#### 3.2.2 Polygones officiels (`mali-cercles-polygons.json`)

Depuis **mai 2026**, le repo contient également `data/mali/mali-cercles-polygons.json` (~517 KB) :

- **Source** : [geoBoundaries gbOpen ADM2 (release 2023-12-12)](https://www.geoboundaries.org/)
- **Licence** : CC BY 4.0 (attribution requise)
- **Couverture** : **50 polygones cercles** (structure pré-loi 2023, simplifiée pour le web)
- **Usage** : couche choroplèthe au zoom cercles dans `MaliHeatmap`, validation géométrique des
  centroïdes `cercles.json`

#### 3.2.3 Cohérence cercles.json ↔ polygones — audit

Le script `scripts/audit-cercles-coverage.mjs` (cible `make audit-cercles`) croise les deux datasets
par normalisation des noms (NFD + lowercase + suppression tirets/apostrophes) et produit 3 rapports
:

| Catégorie                                  | Effectif | Action requise                          |
| ------------------------------------------ | -------: | --------------------------------------- |
| Correspondances exactes (JSON ∩ polygones) |       47 | ✅ utilisables tel quel pour heatmap    |
| Polygones SANS cercle JSON                 |        3 | Différences orthographiques mineures \* |
| Cercles JSON SANS polygone                 |       17 | Nouvelles régions post-2023 + Bamako    |

\* Différences détectées : `Nioro` ↔ `Nioro du Sahel`, `Baroueli` ↔ `Baraouéli`, et le District de
Bamako (qui n'est pas un cercle au niveau ADM2 geoBoundaries mais classé ADM1 dans leur taxonomie).

Les **17 cercles JSON sans polygone** se répartissent en deux groupes :

1. **6 communes urbaines de Bamako** traitées comme cercles dans notre modèle (cf. §4.2) : leurs
   polygones existent à un niveau ADM3 geoBoundaries non téléchargé en V1.
2. **11 cercles des nouvelles régions post-2023** (Taoudénit, Ménaka, Bandiagara, Bougouni,
   Koutiala, San, Douentza, Nara, Dioïla, Nioro, Kita) : créés après la release geoBoundaries ADM2
   2023-12-12, à enrichir via INSTAT (cf. `docs/data/instat-data-request.md`) ou via une release
   geoBoundaries ultérieure.

#### 3.2.4 Enrichissement automatisé Wikipédia + Nominatim (livré mai 2026)

Le script **`scripts/enrich-cercles.py`** (~340 lignes) automatise l'enrichissement nominal :

```powershell
# Dry-run (recommandé) — aucune écriture
make enrich-cercles
# ou : python scripts/enrich-cercles.py

# Appliquer + régénérer le SQL dérivé
make enrich-cercles-write

# Variantes
python scripts/enrich-cercles.py --no-geocode   # offline, sans Nominatim
python scripts/enrich-cercles.py --verbose      # logs DEBUG
```

**Pipeline** :

1. **Fetch** : télécharge `https://fr.wikipedia.org/wiki/Cercles_du_Mali` (cache HTML local 24 h
   dans `.cache/`, évite de hammer Wikipédia).
2. **Parse** : extrait toutes les tables `<table class="wikitable">` via BeautifulSoup4 (parser
   `lxml` si disponible, sinon `html.parser` builtin). Strip le préfixe « Cercle de … » pour aligner
   sur notre convention.
3. **Match** : compare chaque nom (normalisation NFD + lowercase + sans tirets/espaces) contre les
   entrées existantes ; ne propose que ceux absents du JSON.
4. **Géocode** : Nominatim (OpenStreetMap), `countrycodes=ml`, 1 req/s (politique OSM officielle),
   User-Agent identifiable. Pas de clé API requise.
5. **Merge** : non destructif. Les entrées existantes ne sont jamais modifiées ; uniquement des
   ajouts. `code` attribué par incrément `ML-{region}-{NN}` à partir du max existant.
6. **Filtre** : les cercles dont Nominatim ne trouve pas de coordonnée sont **exclus** du JSON et
   listés dans le rapport stdout (évite de polluer la bbox du schema).

**Résultats du run mai 2026** :

| Métrique                            |        Valeur |
| ----------------------------------- | ------------: |
| Cercles extraits de Wikipédia       |           129 |
| Déjà présents dans le JSON          |            44 |
| Nouveaux candidats                  |            85 |
| Géocodés avec succès                | **78 (92 %)** |
| Sans géocode (à enrichir manuel)    |             7 |
| **Total final dans `cercles.json`** | **142 / 159** |

**Prérequis** :

```powershell
pip install -r scripts/requirements-enrich.txt
# Dépendances : requests, beautifulsoup4 (lxml optionnel)
```

### 3.3 Arrondissements (niveau 3) — ❌ Structure prête, 0/466

Pas encore peuplé. Source recommandée : INSTAT Mali (recensement RGPH 2009 mis à jour selon la loi
2023). Format à suivre : `data/mali/arrondissements.json` (à créer, schema identique à
`cercles.json` avec `cercle_code` pointant vers le parent).

### 3.4 Communes (niveau 4) — ⚠️ 6/819

Seules les 6 communes urbaines de Bamako sont présentes (intégrées dans `cercles.json` avec
`type_special: "commune_urbaine"`). Les 813 communes rurales restantes sont à ingérer. Volume
gérable manuellement via tables Wikipedia mais fastidieux — le script d'enrichissement peut couvrir
aussi les communes.

### 3.5 Villages (niveau 6) — ❌ Hors scope V1

Volume : **12 712 villages**. Ingérer via :

- INSTAT Mali — fichier complet du RGPH (~5 MB CSV), à demander officiellement.
- OpenStreetMap Overpass API : `[place=village][addr:country="ML"]` ; ~80 % de couverture, sans
  hiérarchie commune ↔ village stricte.

**Recommandation pour V1 NINA-AES** : ne **pas** charger les 12 712 villages en base. Le modèle
`Location` reste à 4 niveaux remplis (pays / région / cercle / commune urbaine ou cercle-bis pour
les rurales). Les villages individuels sont pris dans le champ `firstNameAscii` du citoyen ou dans
un champ texte libre.

---

## 3bis. Stratégie de stockage : SQL **généré** depuis les JSON canoniques

**Décision révisée (mai 2026)** : `infrastructure/scripts/seed-locations.sql` **existe** comme
artefact dérivé, mais reste **généré automatiquement** depuis `data/mali/regions.json` +
`cercles.json`. La source de vérité reste les fichiers JSON.

### Pourquoi ce compromis ?

Le PROMPT 2.1 (Infrastructure & DevOps) demande explicitement un seed SQL pour pouvoir bootstrap
PostgreSQL **avant** que les microservices NestJS (qui hébergent le Prisma seed) soient
opérationnels. C'est un besoin réel en phase 2 d'infrastructure : tests d'intégration, scripts de
migration, vues matérialisées, scénarios DR (Disaster Recovery) où Prisma n'est pas encore déployé.

Mais maintenir un SQL **à la main** créerait un drift inévitable avec les JSON (déjà observé sur
d'autres projets — cf. note historique §5).

**Solution adoptée** :

1. **`data/mali/regions.json` + `cercles.json` restent canoniques.**
2. **`scripts/generate-seed-sql.mjs`** (Node) lit les JSON → écrit le SQL.
3. **`infrastructure/scripts/seed-locations.sql`** est l'artefact généré, commité dans le repo pour
   reproductibilité Docker (monté en `/docker-entrypoint-initdb.d/02-seed-locations.sql`).
4. **`make seed-locations-generate`** régénère le SQL après toute modif des JSON. Pre-commit Husky
   bloquera tout SQL périmé via la chaîne `validate:data` + diff check.

### Schéma cible : `geo_ref` (isolé de Prisma)

Le SQL crée un schéma dédié **`geo_ref`** avec 4 tables :

| Table                     | Contenu                                        | Source         |
| ------------------------- | ---------------------------------------------- | -------------- |
| `geo_ref.regions`         | 20 entités niveau 1                            | `regions.json` |
| `geo_ref.cercles`         | 64 cercles confirmés / 159 attendus            | `cercles.json` |
| `geo_ref.communes`        | 10 communes échantillon (Bamako + chefs-lieux) | inline script  |
| `geo_ref.arrondissements` | Structure prête, 0 entrée (V2 INSTAT)          | —              |

Ce schéma est **distinct** de `public.locations` (table Prisma utilisée par les microservices). Pas
de conflit, pas de drift bidirectionnel : le seed Prisma continue de lire les JSON directement
(cohérence garantie), et le SQL fournit un référentiel statique requêtable par tout outil SQL sans
dépendre de Prisma.

### Workflow

```powershell
# 1) Modifier data/mali/regions.json ou cercles.json
# 2) Régénérer le SQL
make seed-locations-generate
#    OU : node scripts/generate-seed-sql.mjs

# 3) Valider la chaîne complète
pnpm run verify:repo

# 4) Si la DB tourne déjà, ré-appliquer le SQL manuellement :
docker exec -i nina-postgres psql -U nina_admin -d nina_aes_db \
  < infrastructure/scripts/seed-locations.sql

# 5) Commit
git add data/mali/ infrastructure/scripts/seed-locations.sql
git commit -m "data(mali): enrichit cercles + régénère seed SQL"
```

### Ce que le SQL ne contient PAS (et pourquoi)

- **Arrondissements (niveau 3, 466 attendus)** : données absentes. Ingestion V2 via INSTAT.
- **Communes complètes (niveau 4, 819 attendues)** : seul un échantillon pédagogique de 10 communes
  (6 Bamako + 4 chefs-lieux) est inclus.
- **Villages (niveau 6, 12 712 attendus)** : hors scope V1. Le modèle `Location` ne descend pas à ce
  niveau en V1 (cf. §3.5).

Pour étendre, ajouter les données dans un nouveau JSON `data/mali/communes.json` (à créer) + mettre
à jour le générateur pour le consommer.

---

## 4. Hypothèses et corrections appliquées

Liste des choix **non-triviaux** documentés explicitement (en complément des flags `estime` /
`confiance` dans les JSON) :

1. **District de Bamako = niveau 1** : juridiquement particulier (collectivité territoriale
   autonome), mais traité comme une région dans nos données pour éviter une exception dans le modèle
   relationnel.
2. **Communes urbaines de Bamako = niveau 2 (cercle)** : la Commune I de Bamako n'est pas un cercle
   au sens malien, c'est une commune. Pour préserver la hiérarchie 8-niveaux uniforme, nous la
   classons niveau 2 avec `type_special: "commune_urbaine"`. Les utilisateurs du frontend voient «
   Commune IV » sous Bamako exactement comme « Sikasso » sous la région Sikasso.
3. **Cercles partagés / réorganisés** : certains cercles pré-2023 ont changé de région (ex.
   Yanfolila était à Sikasso, est désormais à Bougouni). Nous appliquons le **rattachement
   post-2023** dans `region_code`. L'historique pré-2023 n'est pas conservé (un cercle = une
   région).
4. **Coordonnées centroïdes** : pour les régions de création récente (Taoudénit, Ménaka), les
   centroïdes pointent sur le chef-lieu et non sur le centre géographique de la région (zones
   désertiques sans centre démographique clair). Pour la cartographie heatmap, **utiliser les
   polygones HDX** plutôt que les centroïdes.
5. **Encodage des caractères** : tous les noms en UTF-8 NFC (forme normalisée composée). Les
   caractères spéciaux (`é`, `ë`, `ï`, `ô`) sont préservés tels quels dans `nom_officiel`. Le champ
   `nameAscii` (côté Prisma `Location`) est généré par `toAscii()` (cf. `prisma/seed.ts`) pour les
   recherches fuzzy trigram.

---

## 5. Limites connues et risques

| Limite                                           | Impact                                                      | Mitigation                                                              |
| ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| 17 cercles non géoréférencés (sur 159 attendus)  | Couverture cercle ~89 % — qq trous résiduels                | `enrich-cercles.py` livré (mai 2026 — 78 ajouts) ; INSTAT pour le reste |
| Pas de polygones administratifs (que des Points) | Heatmap par région impossible sans données externes         | Ingérer shapefile HDX OCHA via `mapshaper` (cf. §6)                     |
| 813 communes rurales absentes                    | Citoyens ruraux ne peuvent pas saisir leur commune dans les | Champ texte libre + suggestion floue (RapidFuzz côté `ai-service`)      |
|                                                  | dropdowns hiérarchiques précâblés                           |                                                                         |
| Coordonnées de cercles désertiques estimées      | Markers cartographiques mal positionnés à zoom élevé        | Vérification manuelle visuelle après ingestion HDX                      |
| Loi 2023 partiellement opérationnelle (2026)     | Certaines régions « légalement créées » mais pas encore     | Frontend masque les régions non-opérationnelles via flag                |
|                                                  | dotées d'administration locale                              | `"statut_2023"` dans `regions.json`                                     |
| Évolutions futures de la loi                     | Le découpage peut encore changer (loi en discussion 2025)   | Versionner `regions.json` (champ `metadata.version`) + ADR              |

---

## 6. Stratégie de mise à jour

### 6.1 Cadence

| Type de donnée             | Fréquence de revue | Déclencheur                                 |
| -------------------------- | ------------------ | ------------------------------------------- |
| Régions (niveau 1)         | Annuelle           | Publication d'une nouvelle loi territoriale |
| Cercles (niveau 2)         | Trimestrielle      | Mise à jour Wikipedia FR + vérif MATD       |
| Arrondissements / communes | Semestrielle       | Recensement INSTAT                          |
| Villages                   | Sur demande        | Cas particulier dans le seed-data           |
| Coordonnées géographiques  | Annuelle           | Comparaison avec OpenStreetMap              |

### 6.2 Workflow de mise à jour

```text
1. Modifier regions.json / cercles.json / mali.geojson
2. Bumper metadata.version en YYYY.MM.DD
3. Lancer la validation : `pnpm tsx scripts/validate-mali-data.ts`
4. Mettre à jour packages/database/prisma/seed.ts si la structure change
5. Re-seeder la base : `pnpm --filter @nina-aes/database db:seed`
6. Mettre à jour ce document (§3 état de complétude)
7. Commit conventionnel : `data(mali): mise à jour référentiel administratif vYYYY.MM.DD`
```

### 6.3 Ingestion automatique des polygones HDX

```powershell
# 1) Télécharger le shapefile officiel UN OCHA (CC BY)
curl -L -o /tmp/mli_admbnda.zip `
  https://data.humdata.org/dataset/cod-ab-mli/resource/abc123/download/mli_admbnda.zip
unzip /tmp/mli_admbnda.zip -d /tmp/mli_admbnda

# 2) Convertir en GeoJSON simplifié (5% des sommets — léger pour le web)
# Requis : mapshaper (npm i -g mapshaper)
mapshaper /tmp/mli_admbnda/mli_admbnda_adm1.shp `
  -simplify 5% `
  -o data/mali/mali-regions-polygons.geojson

# 3) Idem pour les cercles
mapshaper /tmp/mli_admbnda/mli_admbnda_adm2.shp `
  -simplify 8% `
  -o data/mali/mali-cercles-polygons.geojson

# 4) Vérifier la géométrie (pas d'auto-intersection, fermeture des polygones)
pnpm dlx @turf/turf-validate data/mali/mali-regions-polygons.geojson
```

---

## 7. Validation et tests

### 7.1 Invariants à vérifier

1. ∀ cercle dans `cercles.json` : son `region_code` existe dans `regions.json`.
2. ∀ région : son `code` est unique et au format `ML-NN`.
3. ∀ centroïde : `lat ∈ [10.0, 25.1]` et `lng ∈ [-12.3, 4.3]` (boîte englobante du Mali avec marge).
4. Total régions = 19, total district = 1, total niveau 1 = 20.
5. Tous les `chef_lieu` sont présents en tant que cercles dans `cercles.json` (cohérence
   référentielle).

Script de validation à créer (`scripts/validate-mali-data.ts`) :

```ts
// Lit les 3 fichiers JSON, applique les 5 invariants ci-dessus,
// imprime un rapport de cohérence et exit avec code 1 si KO.
```

### 7.2 Tests unitaires

- `packages/utils/src/__tests__/geo.test.ts` (à créer) : valider les helpers géographiques (calcul
  de distance, recherche par bbox, etc.).
- `packages/database/src/__tests__/locations.test.ts` (à créer) : valider que le seed Prisma charge
  bien les 20 régions.

---

## 8. Intégration côté projet — où ces données vivent

### 8.1 Frontend (apps/citizen, apps/admin, apps/governance)

- **`packages/ui/src/business/MaliMap.tsx`** consomme `mali.geojson` pour le rendu des centroïdes
  Points (Leaflet markers ou D3 projection).
- **Quand les polygones HDX sont ingérés** : la même `MaliMap` ajoute une couche
  `<GeoJSON data={polygons} />` pour le rendu choroplèthe heatmap.
- **`packages/ui/src/business/MaliHeatmap.tsx`** projette une métrique sur les polygones régionaux
  (gradient color/success/100 → color/danger/500).
- Les 3 apps importent `data/mali/regions.json` directement via tsconfig path alias `@nina-aes/data`
  (à configurer une fois pour toutes).

### 8.2 Backend (services NestJS)

- **`identity-service`** valide les `Citizen.birthPlaceId` / `Citizen.residenceId` contre le
  référentiel chargé en mémoire au démarrage (cache Redis 24 h).
- **`appointment-service`** utilise les centroïdes pour le calcul de distance citoyen ↔ centre
  RAVEC.
- **`vulnerability-service`** filtre les agents mobiles par région.

### 8.3 Base de données (`@nina-aes/database`)

- Le seed `prisma/seed.ts` lit `regions.json` + `cercles.json` et **upsert** toutes les `Location`
  correspondantes en respectant la hiérarchie via `parentId`.
- Les colonnes `latitude` / `longitude` (`Decimal(10,7)`) reçoivent les centroïdes ; la colonne
  `geom` (`geography(Point,4326)`) est remplie par un trigger SQL `BEFORE INSERT` qui fait
  `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`.
- Index GIN trigram sur `nameAscii` permet la recherche fuzzy ("Sikaso" trouve "Sikasso").

### 8.4 IA (`ai-service`)

- Le module de **fuzzy matching** charge les noms de régions/cercles au démarrage (cache mémoire)
  pour propositions de correction.
- RapidFuzz score + Jellyfish Levenshtein → seuil de confiance ≥ 85 pour auto-suggestion.

---

## 9. Checklist des mises à jour appliquées au projet (mai 2026)

- [x] `data/mali/regions.json` créé (20 entrées complètes)
- [x] `data/mali/cercles.json` créé (142 cercles : 64 haute + 78 moyenne confiance via
      Wikipedia/Nominatim)
- [x] `data/mali/mali.geojson` créé (centroïdes Points)
- [x] `data/mali/mali-regions-polygons.json` créé (9 polygones admin1 geoBoundaries)
- [x] `data/mali/mali-cercles-polygons.json` créé (50 polygones admin2 geoBoundaries, mai 2026)
- [x] `docs/data/mali-divisions.md` créé (ce document)
- [x] `docs/data/integration-guide.md` créé (cf. fichier voisin)
- [x] `docs/data/instat-data-request.md` créé (template demande officielle INSTAT, mai 2026)
- [x] `scripts/generate-seed-sql.mjs` créé (générateur SQL idempotent)
- [x] `scripts/audit-cercles-coverage.mjs` créé (audit JSON ↔ polygones, mai 2026)
- [x] `infrastructure/scripts/seed-locations.sql` généré (artefact dérivé)
- [x] `scripts/validate-mali-data.mjs` créé (validation des 5 invariants)
- [ ] `packages/database/prisma/seed.ts` mis à jour avec les 20 régions _(en cours — voir §10
      ci-dessous)_
- [x] `scripts/enrich-cercles.py` créé (Wikipedia + Nominatim, mai 2026 — 78 cercles ajoutés)
- [ ] Polygones HDX OCHA enrichis (mali-cercles-polygons.geojson)
- [ ] Tests unitaires `geo.test.ts` écrits

---

## 10. Mise à jour du seed Prisma

Le `prisma/seed.ts` actuel charge **10 régions** correspondant à la structure pré-2023. La mise à
jour pour passer aux 20 entités est consignée dans le commit
`data(mali): aligne seed Prisma sur loi 2023` (cf. fichier `packages/database/prisma/seed.ts` après
application de cette session).

**Différentiel principal** :

- Suppression de l'ancienne tableau `REGIONS` codé en dur (10 entrées)
- Ajout d'un import `import regions from '../../../data/mali/regions.json'`
- Boucle de seed qui upsert 20 `Location` au niveau 1 (au lieu de 10)
- Cercles : import similaire depuis `cercles.json` ; les 65 cercles connus sont seedés, les 94
  manquants attendent l'enrichissement

---

## 11. Annexe — Glossaire administratif malien

| Terme                   | Définition                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Région**              | Subdivision de niveau 1 du Mali, dirigée par un Gouverneur (préfet régional) |
| **District**            | Statut spécifique de Bamako — collectivité territoriale autonome             |
| **Cercle**              | Subdivision de niveau 2, dirigée par un Préfet de cercle                     |
| **Arrondissement**      | Subdivision de niveau 3, dirigée par un Sous-Préfet                          |
| **Commune**             | Niveau 4, dirigée par un Maire élu (commune urbaine ou rurale)               |
| **Quartier / Fraction** | Subdivision communale (urbain : quartier ; nomade : fraction)                |
| **Village**             | Plus petite unité administrative reconnue (avec un Chef de village)          |
| **CTDEC**               | Centre de Traitement des Données de l'État Civil — gère la base NINA         |
| **DNEC**                | Direction Nationale de l'État Civil                                          |
| **MATD**                | Ministère de l'Administration Territoriale et de la Décentralisation         |
| **RAVEC**               | Recensement Administratif à Vocation d'État Civil (programme depuis 2009)    |

---

## 12. Pour aller plus loin

- **Étude approfondie de la loi 2023** : `Journal Officiel n° 12, 13 mars 2023`
- **Cartographie souveraine** : alternatives à Mapbox (qui dépend de Tiles US) :
  - `protomaps` + tiles auto-hébergés (souverain)
  - `MapTiler Server` (peut être déployé on-premise)
- **Données démographiques** : INSTAT Mali, RGPH 2024 (en cours de publication)
- **Frontières internationales** : attention au tracé Mali ↔ Burkina (litige Soum réglé en 1986 par
  CIJ, mais cartes anciennes encore en circulation)
