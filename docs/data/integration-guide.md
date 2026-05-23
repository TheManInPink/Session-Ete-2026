# Guide d'intégration des données administratives Mali

> **Compagnon de** `mali-divisions.md` (référentiel + sources). Ce document explique **comment
> consommer** les fichiers `data/mali/*` dans chaque couche du projet (frontend, backend, base de
> données, IA).

---

## 1. Vue d'ensemble — chaîne de données

```
┌────────────────────┐     loi 2023       ┌──────────────────────┐
│  Sources externes  │ ─────────────────▶ │ data/mali/*.json     │
│  (Wikipedia, HDX,  │                    │ data/mali/*.geojson  │
│   INSTAT, MATD)    │                    │ (source de vérité)   │
└────────────────────┘                    └──────────┬───────────┘
                                                     │
                       ┌─────────────────────────────┼──────────────────────────────┐
                       │                             │                              │
                       ▼                             ▼                              ▼
            ┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
            │ packages/database│          │ Frontend         │          │ Services NestJS  │
            │ prisma/seed.ts   │          │ apps/citizen     │          │ identity-service │
            │ (chargement DB)  │          │ MaliMap.tsx      │          │ (cache Redis 24h)│
            └────────┬─────────┘          └──────────────────┘          └──────────────────┘
                     │
                     ▼
            ┌──────────────────┐
            │ PostgreSQL       │
            │ Location table   │
            │ (8 niveaux,      │
            │  index trigram)  │
            └──────────────────┘
```

**Règle d'or** : aucun service ne doit jamais coder en dur le nom d'une région ou d'un cercle
malien. Toujours passer par :

1. **`data/mali/*.json`** (source) →
2. **`Location` table Prisma** (cache requêtable) ou
3. **`@nina-aes/data`** alias pnpm (import direct du JSON pour les besoins purement lecture côté
   frontend).

---

## 2. Couche base de données

### 2.1 Chargement initial

```powershell
cd C:\Users\lonel\Projet-En-Informatique\Session-Ete-2026\nina-aes-platform

# 1) Démarre PostgreSQL si nécessaire
pnpm docker:up

# 2) Applique les migrations
pnpm --filter @nina-aes/database exec prisma migrate dev

# 3) Seed initial — lit data/mali/regions.json + cercles.json
pnpm --filter @nina-aes/database db:seed
```

Résultat attendu (à comparer avec le `wc -l` final) :

| Niveau | Type      |          Nombre attendu après seed |
| ------ | --------- | ---------------------------------: |
| 0      | Pays      |                                  1 |
| 1      | Région    |             **20** (19 + District) |
| 2      | Cercle    |        **65** (post-2023, partiel) |
| 3      | Commune   | **~150** (échantillon pédagogique) |
| Total  | Locations |                            **236** |

Validation :

```powershell
docker exec nina-postgres psql -U nina_admin -d nina_aes_db -c "
  SELECT level, COUNT(*) AS n
  FROM locations
  GROUP BY level
  ORDER BY level;"
```

### 2.1bis Bootstrap SQL (sans Prisma) — schéma `geo_ref`

Avant que les microservices NestJS (et donc Prisma) soient déployés, certains scénarios ont besoin
de requêter le référentiel : tests d'intégration BDD-only, scripts de DR (Disaster Recovery), vues
matérialisées analytiques. Pour ces cas, le seed SQL `infrastructure/scripts/seed-locations.sql`
(généré depuis les JSON) charge un schéma **isolé** `geo_ref` au premier démarrage Postgres (monté
en `/docker-entrypoint-initdb.d/02-seed-locations.sql`).

```powershell
# Auto-exécuté au premier `docker:up`. Pour réappliquer manuellement :
docker exec -i nina-postgres psql -U nina_admin -d nina_aes_db `
  < infrastructure/scripts/seed-locations.sql
```

Contenu :

| Schema    | Table           | Niveau | Cardinalité       |
| --------- | --------------- | ------ | ----------------- |
| `geo_ref` | regions         | 1      | 20                |
| `geo_ref` | cercles         | 2      | 64 / 159 attendus |
| `geo_ref` | communes        | 4      | 10 (échantillon)  |
| `geo_ref` | arrondissements | 3      | 0 (V2 INSTAT)     |

Requête type :

```sql
-- Régions avec centroïdes + langues
SELECT code, name_short, chef_lieu, lat, lng, langues
FROM geo_ref.regions ORDER BY code;

-- Cercles d'une région
SELECT c.code, c.name, c.confiance
FROM geo_ref.cercles c
WHERE c.region_code = 'ML-05'
ORDER BY c.name;
```

**Régénération après modification des JSON** :

```powershell
# Lit data/mali/*.json → réécrit infrastructure/scripts/seed-locations.sql
make seed-locations-generate
# OU directement : node scripts/generate-seed-sql.mjs
```

> 📝 Le seed Prisma (`packages/database/prisma/seed.ts`) reste la voie **principale** de chargement
> runtime ; il consomme directement les JSON et peuple `public.locations`. Le schéma `geo_ref` est
> un complément pour les usages infra-first décrits ci-dessus.

### 2.2 Re-seed après mise à jour des fichiers JSON

Les seeds sont **idempotents** (`upsert` sur la clé `code`). Pour re-synchroniser après modification
de `regions.json` ou `cercles.json` :

```powershell
# Côté Prisma (public.locations) :
pnpm --filter @nina-aes/database db:seed
# Côté infra (geo_ref.*) :
make seed-locations-generate
docker exec -i nina-postgres psql -U nina_admin -d nina_aes_db `
  < infrastructure/scripts/seed-locations.sql
```

### 2.3 Recherche fuzzy par trigram (PostgreSQL)

Le seed remplit automatiquement `nameAscii` (version sans diacritiques) qui est indexée GIN trigram.
Exemple de requête fuzzy directe (mot mal orthographié) :

```sql
SELECT code, name, similarity(name_ascii, 'SIKASO') AS sim
FROM locations
WHERE name_ascii % 'SIKASO'  -- opérateur similarité (pg_trgm)
  AND level = 2
ORDER BY sim DESC
LIMIT 5;
-- Renvoie : ML-03-01 Sikasso (sim ≈ 0.86)
```

---

## 3. Couche backend — services NestJS

### 3.1 Cache au démarrage

`identity-service`, `appointment-service` et `vulnerability-service` doivent charger en **cache
Redis** la liste des régions + cercles au démarrage, avec TTL 24 h (recharge nocturne) :

```typescript
// services/identity-service/src/locations/locations.cache.ts
/**
 * @file        locations.cache.ts
 * @description Cache Redis du référentiel administratif Mali.
 *              TTL 24 h, rechargement automatique.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { prisma } from '@nina-aes/database';

@Injectable()
export class LocationsCache implements OnModuleInit {
  private static readonly KEY = 'locations:mali:hierarchy';
  private static readonly TTL = 24 * 3600; // 24 h

  constructor(private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    const exists = await this.redis.exists(LocationsCache.KEY);
    if (!exists) await this.refresh();
  }

  /**
   * Récupère la hiérarchie complète depuis le cache (ou la rafraîchit
   * si TTL expiré).
   */
  async getHierarchy(): Promise<unknown[]> {
    const raw = await this.redis.get(LocationsCache.KEY);
    if (raw) return JSON.parse(raw);
    return this.refresh();
  }

  /** Recharge depuis Postgres et met à jour le cache. */
  private async refresh(): Promise<unknown[]> {
    const locations = await prisma.location.findMany({
      where: { level: { in: [1, 2] } },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        parentId: true,
        latitude: true,
        longitude: true,
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    await this.redis.set(LocationsCache.KEY, JSON.stringify(locations), 'EX', LocationsCache.TTL);
    return locations;
  }
}
```

### 3.2 Validation côté service (Zod)

Quand un citoyen soumet un `birthPlaceId` ou `residenceId`, valider qu'il existe bien dans le
référentiel :

```typescript
// services/identity-service/src/citizens/citizens.validator.ts
import { z } from 'zod';

/** Référence à une Location existante. */
export const locationRefSchema = z
  .string()
  .uuid()
  .refine(
    async (id) => {
      const exists = await prisma.location.findUnique({
        where: { id },
        select: { id: true },
      });
      return !!exists;
    },
    { message: 'Location introuvable dans le référentiel administratif.' },
  );
```

### 3.3 Calcul de distance (centre RAVEC ↔ citoyen)

Pour `appointment-service` qui suggère le centre le plus proche :

```typescript
// services/appointment-service/src/centers/distance.service.ts
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Distance Haversine entre deux points en km.
 * Utilise les colonnes latitude/longitude des Location.
 */
export function haversineKm(
  a: { lat: number | Decimal; lng: number | Decimal },
  b: { lat: number | Decimal; lng: number | Decimal },
): number {
  const toNum = (x: number | Decimal) => (typeof x === 'number' ? x : x.toNumber());
  const φ1 = (toNum(a.lat) * Math.PI) / 180;
  const φ2 = (toNum(b.lat) * Math.PI) / 180;
  const Δφ = ((toNum(b.lat) - toNum(a.lat)) * Math.PI) / 180;
  const Δλ = ((toNum(b.lng) - toNum(a.lng)) * Math.PI) / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
```

> 📝 **Pour la prod** : passer à PostGIS (`ST_DistanceSphere`) qui gère nativement les calculs
> géodésiques sur la colonne `geom geography(Point,4326)` déjà déclarée dans le schéma Prisma.

---

## 4. Couche frontend — apps Next.js

### 4.1 Alias pnpm pour import direct des JSON

**`tsconfig.base.json`** (à créer dans `packages/typescript-config/` si pas déjà fait) :

```json
{
  "compilerOptions": {
    "paths": {
      "@nina-aes/data/*": ["../../data/*"]
    }
  }
}
```

Usage dans une app :

```typescript
// apps/citizen/src/components/RegionDropdown.tsx
import regionsData from '@nina-aes/data/mali/regions.json';

export function RegionDropdown({ onSelect }: { onSelect: (code: string) => void }) {
  return (
    <Select onValueChange={onSelect}>
      <SelectTrigger><SelectValue placeholder="Région" /></SelectTrigger>
      <SelectContent>
        {regionsData.regions.map((r) => (
          <SelectItem key={r.code} value={r.code}>
            🇲🇱 {r.nom_court}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### 4.2 Composant `MaliMap` (D3 + GeoJSON)

```typescript
// packages/ui/src/business/MaliMap.tsx (extrait — 100 lignes)
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import maliGeo from '@nina-aes/data/mali/mali.geojson';

interface Props {
  selectedRegion?: string;
  onRegionClick?: (code: string) => void;
}

/**
 * Carte du Mali avec markers Points pour les 20 entités niveau 1.
 * Quand les polygones HDX seront ingérés (cf. mali-divisions.md §6.3),
 * cette même carte affichera la couche choroplèthe.
 */
export function MaliMap({ selectedRegion, onRegionClick }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    const projection = d3.geoMercator()
      .center([-3.9962, 17.5707])  // Centre géographique Mali
      .scale(1800)
      .translate([300, 250]);

    const regions = maliGeo.features.filter((f) => f.properties.kind === 'region' || f.properties.kind === 'district');

    svg.selectAll('circle')
      .data(regions)
      .join('circle')
      .attr('cx', (d: any) => projection(d.geometry.coordinates)![0])
      .attr('cy', (d: any) => projection(d.geometry.coordinates)![1])
      .attr('r', 8)
      .attr('fill', (d: any) =>
        d.properties.code === selectedRegion ? 'var(--color-accent-500)' : 'var(--color-primary-300)'
      )
      .attr('stroke', 'var(--color-primary-700)')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (_e, d: any) => onRegionClick?.(d.properties.code));

    svg.selectAll('text')
      .data(regions)
      .join('text')
      .attr('x', (d: any) => projection(d.geometry.coordinates)![0] + 12)
      .attr('y', (d: any) => projection(d.geometry.coordinates)![1] + 4)
      .text((d: any) => d.properties.name)
      .attr('font-size', 10)
      .attr('font-family', 'Inter, sans-serif')
      .attr('pointer-events', 'none');
  }, [selectedRegion, onRegionClick]);

  return <svg ref={ref} viewBox="0 0 600 500" role="img" aria-label="Carte du Mali" />;
}
```

### 4.3 Variante avec Leaflet (Cartographie classique)

```typescript
// packages/ui/src/business/MaliMapLeaflet.tsx (alternative)
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import maliGeo from '@nina-aes/data/mali/mali.geojson';

/**
 * Variante Leaflet — utile quand on a besoin de tiles raster + zoom continu.
 * En production souveraine, remplacer le tile provider par MapTiler self-hosted.
 */
export function MaliMapLeaflet() {
  return (
    <MapContainer
      center={[17.5707, -3.9962]}
      zoom={5}
      style={{ height: 500, width: '100%' }}
      aria-label="Carte interactive du Mali"
    >
      <TileLayer
        attribution="© OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {maliGeo.features
        .filter((f) => f.properties.kind === 'region' || f.properties.kind === 'district')
        .map((f) => {
          const [lng, lat] = (f.geometry as { coordinates: [number, number] }).coordinates;
          return (
            <Marker key={f.properties.code} position={[lat, lng]}>
              <Popup>
                <strong>{f.properties.name}</strong>
                <br />
                Chef-lieu : {f.properties.chef_lieu}
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
```

### 4.4 Rendu multi-niveaux selon zoom

Pour la carte choroplèthe complète (régions ↔ cercles ↔ communes) :

| Zoom Leaflet | Niveau affiché         | Source                            |
| ------------ | ---------------------- | --------------------------------- |
| 1 – 5        | Pays (1 marker)        | feature kind=`country`            |
| 5 – 7        | Régions (20 markers)   | features kind=`region`+`district` |
| 7 – 9        | Cercles (65 markers)   | features kind=`cercle`            |
| 9 +          | Communes (échantillon) | requête API `/locations?level=3`  |

```typescript
import { useMapEvents } from 'react-leaflet';

function ZoomBasedLayer() {
  const [level, setLevel] = useState(1);
  useMapEvents({
    zoom: (e) => {
      const z = e.target.getZoom();
      if (z < 5) setLevel(0);
      else if (z < 7) setLevel(1);
      else if (z < 9) setLevel(2);
      else setLevel(3);
    },
  });
  // ... rendu conditionnel selon `level`
}
```

---

## 5. Couche IA — fuzzy matching

Le `ai-service` (FastAPI) charge les noms de régions/cercles au démarrage et expose un endpoint de
suggestion :

```python
# services/ai-service/app/locations/fuzzy.py
from rapidfuzz import process, fuzz
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "data" / "mali"

with (DATA / "regions.json").open(encoding="utf-8") as f:
    REGIONS = [r["nom_court"] for r in json.load(f)["regions"]]

with (DATA / "cercles.json").open(encoding="utf-8") as f:
    CERCLES = [c["nom"] for c in json.load(f)["cercles"]]

NAMES = REGIONS + CERCLES  # ~85 entrées


def suggest(query: str, limit: int = 5) -> list[tuple[str, int]]:
    """Retourne les `limit` correspondances les plus proches.

    Args:
        query: Saisie utilisateur (ex. "Sikaso").
        limit: Nombre de suggestions max.

    Returns:
        Liste [(nom, score)] triée par score décroissant.
        Score ≥ 85 = haute confiance, ≥ 60 = moyenne.
    """
    return process.extract(
        query,
        NAMES,
        scorer=fuzz.WRatio,
        limit=limit,
    )
```

Ce module est consommé par le pipeline de correction (cf. doc 11) pour suggérer la valeur correcte
quand un citoyen saisit "Sikaso" → "Sikasso 95".

---

## 6. Validation des données

Le script `scripts/validate-mali-data.ts` valide les invariants :

```bash
pnpm exec tsx scripts/validate-mali-data.ts
```

(Le fichier de script est livré à part — voir prochaine section.)

---

## 7. Mise à jour incrémentale (workflow type)

Quand vous voulez ajouter / corriger des données :

```bash
# 1. Modifier data/mali/cercles.json (ajout des cercles manquants)
# 2. Bumper la version dans metadata.version
# 3. Valider la cohérence
pnpm exec tsx scripts/validate-mali-data.ts

# 4. Re-seeder la base (idempotent)
pnpm --filter @nina-aes/database db:seed

# 5. Vérifier les compteurs
docker exec nina-postgres psql -U nina_admin -d nina_aes_db -c \
  "SELECT level, COUNT(*) FROM locations GROUP BY level"

# 6. Commit
git add data/mali/ docs/data/
git commit -m "data(mali): enrichit cercles avec X nouvelles entrées (vYYYY.MM.DD)"
```

---

## 8. Erreurs courantes

| Symptôme                                           | Cause probable                                                | Solution                                                 |
| -------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `seed.ts` crashe avec `Parent "ML-XX" introuvable` | Cercle référence une région absente de `regions.json`         | Vérifier `region_code` du cercle, ajouter la région      |
| Carte affiche un marker au mauvais endroit         | `centroide.estime: true` — coordonnée approximative           | Vérifier dans GeoNames + corriger dans `cercles.json`    |
| `prisma migrate` se plaint du soft-delete          | Index trigram créé avant l'extension `pg_trgm`                | Vérifier que le schema déclare bien `extensions = [...]` |
| Recherche fuzzy renvoie 0 résultats                | `nameAscii` non rempli (toAscii() KO sur certains caractères) | Ajouter le caractère exotique dans `toAscii()` regex     |
| Frontend importe `mali.geojson` mais TS se plaint  | `resolveJsonModule: false`                                    | `tsconfig.json` → `"resolveJsonModule": true`            |

---

## 9. Pour aller plus loin

- Polygones HDX : <https://data.humdata.org/organization/ocha-mali>
- Convertisseur Shape → GeoJSON simplifié : <https://mapshaper.org/>
- Tuiles cartographiques souveraines : <https://protomaps.com/> (auto-héberger)
- INSTAT Mali (pour le RGPH) : <https://www.instat-mali.org>
- Bibliothèque calcul géo Node : `@turf/turf` (5 MB tree-shakable)
