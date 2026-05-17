/**
 * @file        mali-heatmap.tsx
 * @description Heatmap des régions du Mali — deux modes selon les props :
 *
 *              1. CHOROPLÈTHE (recommandé, si `geojson` fourni)
 *                 Polygones admin level 1 réels remplis selon la métrique.
 *                 Source : geoBoundaries gbOpen MLI ADM1 simplifié (9 régions
 *                 historiques pré-2016 — couvrent 100 % du territoire).
 *
 *              2. BUBBLE MAP (fallback, si `geojson` absent)
 *                 Cercles centroïdes proportionnels aux valeurs.
 *
 *              Mapping codes : geoBoundaries utilise `ML-1` à `ML-8` + `ML-BKO`
 *              pour les 9 régions historiques. Notre `MaliHeatmapDatum.regionCode`
 *              utilise le format ISO 3166-2:ML étendu (ML-01 à ML-20). Le
 *              mapping est appliqué au lookup (cf. `LEGACY_CODE_MAP`).
 *
 *              Accessibilité : `<svg role="img">` + `<title>` global +
 *              `<title>` par polygone (tooltip natif). Polygones interactifs
 *              au clavier (tabIndex + Enter/Space) si `onRegionClick` fourni.
 *
 * @module      @nina-aes/ui
 */

'use client';

import * as React from 'react';
import { cn } from '../../lib/utils.js';

/** Centroïdes des 20 régions/cercles Mali (level=1 dans mali.geojson). */
const MALI_REGIONS = [
  { code: 'ML-01', name: 'Kayes', lon: -11.4444, lat: 14.4467 },
  { code: 'ML-02', name: 'Koulikoro', lon: -7.5598, lat: 12.8628 },
  { code: 'ML-03', name: 'Sikasso', lon: -5.6665, lat: 11.3176 },
  { code: 'ML-04', name: 'Ségou', lon: -6.2156, lat: 13.4318 },
  { code: 'ML-05', name: 'Mopti', lon: -4.1827, lat: 14.4843 },
  { code: 'ML-06', name: 'Tombouctou', lon: -3.0087, lat: 16.7722 },
  { code: 'ML-07', name: 'Gao', lon: -0.0459, lat: 16.2711 },
  { code: 'ML-08', name: 'Kidal', lon: 1.408, lat: 18.4412 },
  { code: 'ML-09', name: 'District de Bamako', lon: -8.0029, lat: 12.6392 },
  { code: 'ML-10', name: 'Taoudénit', lon: -3.9794, lat: 22.6783 },
  { code: 'ML-11', name: 'Ménaka', lon: 2.4, lat: 15.916 },
  { code: 'ML-12', name: 'Nioro', lon: -9.5878, lat: 15.2247 },
  { code: 'ML-13', name: 'Kita', lon: -9.4895, lat: 13.0407 },
  { code: 'ML-14', name: 'Dioïla', lon: -6.7984, lat: 12.4953 },
  { code: 'ML-15', name: 'Nara', lon: -7.2853, lat: 15.1701 },
  { code: 'ML-16', name: 'Bougouni', lon: -7.4833, lat: 11.4167 },
  { code: 'ML-17', name: 'Koutiala', lon: -5.4642, lat: 12.3917 },
  { code: 'ML-18', name: 'San', lon: -4.8964, lat: 13.3033 },
  { code: 'ML-19', name: 'Bandiagara', lon: -3.6111, lat: 14.35 },
  { code: 'ML-20', name: 'Douentza', lon: -2.9469, lat: 15.0028 },
] as const;

/** Mapping geoBoundaries shapeISO → notre code interne ML-NN.
 *  geoBoundaries fournit les 9 régions historiques pré-2016 ; les nouvelles
 *  régions (ML-10 à ML-20) n'ont pas de polygones séparés et seront affichées
 *  en marqueurs centroïdes par-dessus la choroplèthe. */
const LEGACY_CODE_MAP: Record<string, string> = {
  'ML-1': 'ML-01',
  'ML-2': 'ML-02',
  'ML-3': 'ML-03',
  'ML-4': 'ML-04',
  'ML-5': 'ML-05',
  'ML-6': 'ML-06',
  'ML-7': 'ML-07',
  'ML-8': 'ML-08',
  'ML-BKO': 'ML-09',
};

/** Régions historiques (avec polygone) vs nouvelles (subdivisions). */
const LEGACY_REGION_CODES = new Set(Object.values(LEGACY_CODE_MAP));

/** Bbox couvrant exactement les polygones geoBoundaries Mali. */
const BBOX = { lonMin: -12.3, lonMax: 4.3, latMin: 10, latMax: 25 };
const VIEW_BOX_WIDTH = 100;
const VIEW_BOX_HEIGHT = Math.round(
  ((BBOX.latMax - BBOX.latMin) / (BBOX.lonMax - BBOX.lonMin)) * VIEW_BOX_WIDTH,
);

// ── Types GeoJSON minimaux (subset de RFC 7946) ─────────────────────────────
interface GeoFeature {
  type: 'Feature';
  properties: {
    shapeISO?: string;
    shapeName?: string;
    [k: string]: unknown;
  };
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}
interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

/** Données passées à la heatmap : un nombre par code région (ML-01..ML-20). */
export interface MaliHeatmapDatum {
  regionCode: string;
  value: number;
  /** Légende custom au hover. Si absent : `{name} : {value}`. */
  label?: string;
}

export interface MaliHeatmapProps {
  data: MaliHeatmapDatum[];
  /** GeoJSON FeatureCollection avec polygones. Si fourni → mode choroplèthe.
   *  Sinon → fallback bubble map (centroïdes). */
  geojson?: GeoFeatureCollection;
  tone?: 'sequential' | 'severity';
  width?: number;
  /** Mode bubble seulement : rayon min des cercles (valeur 0). */
  minRadius?: number;
  /** Mode bubble seulement : rayon max des cercles (max(data)). */
  maxRadius?: number;
  onRegionClick?: (datum: MaliHeatmapDatum & { name: string }) => void;
  ariaLabel?: string;
  className?: string;
}

/** Projette (lon, lat) → (x, y) dans le viewBox SVG. */
function project(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon - BBOX.lonMin) / (BBOX.lonMax - BBOX.lonMin)) * VIEW_BOX_WIDTH;
  // Inversion Y : latitude haute → y bas du SVG
  const y =
    (1 - (lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * VIEW_BOX_HEIGHT;
  return { x, y };
}

/** Convertit un anneau de coordonnées GeoJSON en `d` SVG path. */
function ringToPath(ring: number[][]): string {
  return ring
    .map(([lon, lat], i) => {
      const { x, y } = project(lon as number, lat as number);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(' ');
}

/** Convertit Polygon ou MultiPolygon en `d` SVG complet (subpaths concaténés). */
function geometryToPath(geometry: GeoFeature['geometry']): string {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map(ringToPath).join(' Z ') + ' Z';
  }
  // MultiPolygon : chaque polygone est un array d'anneaux
  return geometry.coordinates
    .map((poly) => poly.map(ringToPath).join(' Z '))
    .join(' Z ') + ' Z';
}

/** Couleur HSL pour une valeur normalisée [0..1] selon le tone. */
function colorFor(tone: 'sequential' | 'severity', t: number): string {
  if (tone === 'severity') {
    const hue = 120 - t * 120;
    const sat = 60 + t * 25;
    const light = 50 - t * 10;
    return `hsl(${hue} ${sat}% ${light}%)`;
  }
  const light = 55 - t * 25;
  return `hsl(212 70% ${light}%)`;
}

export function MaliHeatmap({
  data,
  geojson,
  tone = 'sequential',
  width = 480,
  minRadius = 2,
  maxRadius = 14,
  onRegionClick,
  ariaLabel = 'Carte du Mali — activité par région',
  className,
}: MaliHeatmapProps) {
  const height = (width / VIEW_BOX_WIDTH) * VIEW_BOX_HEIGHT;
  const maxValue = Math.max(1, ...data.map((d) => d.value));

  const byCode = React.useMemo(() => {
    const m = new Map<string, MaliHeatmapDatum>();
    data.forEach((d) => m.set(d.regionCode, d));
    return m;
  }, [data]);

  const isChoropleth = !!geojson;

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      className={cn('h-auto max-w-full select-none', className)}
    >
      <title>{ariaLabel}</title>

      {/* Fond très léger derrière la carte */}
      <rect
        x="0"
        y="0"
        width={VIEW_BOX_WIDTH}
        height={VIEW_BOX_HEIGHT}
        fill="var(--bg-muted)"
        fillOpacity="0.2"
        rx="1"
      />

      {/* ── MODE CHOROPLÈTHE ──────────────────────────────────────────── */}
      {isChoropleth &&
        geojson.features.map((feature) => {
          const legacyCode = (feature.properties.shapeISO as string) ?? '';
          const internalCode = LEGACY_CODE_MAP[legacyCode] ?? legacyCode;
          const datum = byCode.get(internalCode);
          const value = datum?.value ?? 0;
          const t = value / maxValue;
          const fill = datum
            ? colorFor(tone, t)
            : 'var(--bg-muted)';
          const fillOpacity = datum ? 0.75 : 0.4;
          const region = MALI_REGIONS.find((r) => r.code === internalCode);
          const name = region?.name ?? feature.properties.shapeName ?? legacyCode;
          const label = datum?.label ?? `${name} : ${value}`;
          const clickable = !!datum && typeof onRegionClick === 'function';

          return (
            <g
              key={legacyCode}
              className={cn(clickable && 'cursor-pointer focus:outline-none')}
              tabIndex={clickable ? 0 : -1}
              role={clickable ? 'button' : 'img'}
              aria-label={label}
              onClick={
                clickable && datum
                  ? () => onRegionClick({ ...datum, name })
                  : undefined
              }
              onKeyDown={
                clickable && datum
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRegionClick({ ...datum, name });
                      }
                    }
                  : undefined
              }
            >
              <path
                d={geometryToPath(feature.geometry)}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke="var(--bg-card)"
                strokeWidth="0.3"
                strokeLinejoin="round"
                className="transition-all hover:brightness-110"
              />
              <title>{label}</title>
            </g>
          );
        })}

      {/* ── MODE BUBBLE (fallback) ────────────────────────────────────── */}
      {!isChoropleth && (
        <>
          {/* Toutes les régions en gris clair (présence) */}
          {MALI_REGIONS.map((r) => {
            const { x, y } = project(r.lon, r.lat);
            return (
              <circle
                key={`bg-${r.code}`}
                cx={x}
                cy={y}
                r={minRadius * 0.6}
                fill="var(--fg-muted)"
                fillOpacity="0.4"
              />
            );
          })}
          {/* Bubbles actifs */}
          {MALI_REGIONS.map((r) => {
            const datum = byCode.get(r.code);
            if (!datum) return null;
            const { x, y } = project(r.lon, r.lat);
            const t = datum.value / maxValue;
            const radius = minRadius + t * (maxRadius - minRadius);
            const clickable = typeof onRegionClick === 'function';
            const label = datum.label ?? `${r.name} : ${datum.value}`;
            return (
              <g
                key={r.code}
                className={cn(clickable && 'cursor-pointer focus:outline-none')}
                tabIndex={clickable ? 0 : -1}
                role={clickable ? 'button' : 'img'}
                aria-label={label}
                onClick={clickable ? () => onRegionClick({ ...datum, name: r.name }) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRegionClick({ ...datum, name: r.name });
                        }
                      }
                    : undefined
                }
              >
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={colorFor(tone, t)}
                  fillOpacity="0.7"
                  stroke={colorFor(tone, t)}
                  strokeWidth="0.3"
                  className="transition-all"
                />
                <title>{label}</title>
              </g>
            );
          })}
        </>
      )}

      {/* ── Marqueurs centroïdes nouvelles régions (choroplèthe seulement) ── */}
      {/* Pour ML-10 à ML-20 (subdivisions post-2016), si elles ont des
          données, afficher un petit point centroïde car elles n'ont pas
          de polygone propre dans le GeoJSON historique. */}
      {isChoropleth &&
        MALI_REGIONS.filter((r) => !LEGACY_REGION_CODES.has(r.code)).map((r) => {
          const datum = byCode.get(r.code);
          if (!datum) return null;
          const { x, y } = project(r.lon, r.lat);
          const t = datum.value / maxValue;
          const label = datum.label ?? `${r.name} : ${datum.value}`;
          return (
            <g key={`subd-${r.code}`}>
              <circle
                cx={x}
                cy={y}
                r={1.5}
                fill={colorFor(tone, t)}
                stroke="var(--bg-card)"
                strokeWidth="0.4"
              />
              <title>{label}</title>
            </g>
          );
        })}

      {/* ── Étiquettes des régions principales (zoom-out lisibilité) ─── */}
      {(['ML-09', 'ML-01', 'ML-05', 'ML-07', 'ML-08', 'ML-06', 'ML-03'] as const).map(
        (code) => {
          const r = MALI_REGIONS.find((x) => x.code === code);
          if (!r) return null;
          const { x, y } = project(r.lon, r.lat);
          const shortName = r.name.replace('District de ', '');
          return (
            <text
              key={`label-${code}`}
              x={x}
              y={y - 2.5}
              fontSize="2.2"
              textAnchor="middle"
              fill="var(--fg)"
              fillOpacity="0.85"
              className="pointer-events-none font-medium"
              style={{ paintOrder: 'stroke', stroke: 'var(--bg-card)', strokeWidth: 0.6 }}
            >
              {shortName}
            </text>
          );
        },
      )}
    </svg>
  );
}
