/**
 * @file        mali-heatmap.tsx
 * @description Carte « bubble map » des 20 régions/cercles du Mali avec
 *              une métrique numérique par région. Cercles centroïdes
 *              proportionnels (rayon = √valeur × scale, lisibilité linéaire
 *              de la surface), couleur selon `tone`.
 *
 *              Pourquoi pas une vraie heatmap polygonale ?
 *                Le fichier `data/mali/mali.geojson` ne contient que des
 *                centroïdes Point (pas de polygones de frontières). Le
 *                bubble map est une variante valide de heatmap (densité par
 *                lieu) et garde l'overhead à zéro (aucune librairie chart).
 *
 *              Accessibilité : `<svg role="img">` + `<title>` global + un
 *              `<title>` par cercle (tooltip natif au hover). Pour les
 *              clavier-only, `tabIndex` + `onKeyDown` sur chaque marker.
 *
 * @module      @nina-aes/ui
 */

'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

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

/** Bbox des données Mali (latitude inversée car SVG y va vers le bas). */
const BBOX = { lonMin: -12, lonMax: 3, latMin: 10.5, latMax: 23 };

/** Données passées à la heatmap : un nombre par code région. */
export interface MaliHeatmapDatum {
  /** Code région ML-NN (cf. MALI_REGIONS). Régions inconnues ignorées. */
  regionCode: string;
  /** Valeur métrique — sera mappée linéairement entre min(rayon) et max(rayon). */
  value: number;
  /** Légende custom au hover. Si absent : « {name} : {value} ». */
  label?: string;
}

export interface MaliHeatmapProps {
  /** Données à afficher. Vide → carte vide avec frontières seulement. */
  data: MaliHeatmapDatum[];
  /**
   * Échelle de couleur — `sequential` pour des activités (un seul ton bleu),
   * `severity` pour des alertes (gradient vert → jaune → rouge selon valeur
   * relative au max).
   */
  tone?: 'sequential' | 'severity';
  /** Largeur du SVG en pixels (height = width × 0.75 pour le ratio Mali). */
  width?: number;
  /** Rayon de cercle minimum (valeur 0). */
  minRadius?: number;
  /** Rayon de cercle maximum (valeur = max(data)). */
  maxRadius?: number;
  /** Callback de click sur un marker. */
  onRegionClick?: (datum: MaliHeatmapDatum & { name: string }) => void;
  /** Légende globale lue par les lecteurs d'écran (`<title>` du SVG). */
  ariaLabel?: string;
  className?: string;
}

/** Projette (lon, lat) en (x, y) SVG dans le viewBox 100×75. */
function project(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon - BBOX.lonMin) / (BBOX.lonMax - BBOX.lonMin)) * 100;
  // Inversion Y : latitude haute → y bas du SVG
  const y = (1 - (lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * 75;
  return { x, y };
}

/** Couleur HSL pour une valeur normalisée [0..1] selon le tone. */
function colorFor(tone: 'sequential' | 'severity', t: number): string {
  if (tone === 'severity') {
    // Vert (120°) → Jaune (50°) → Rouge (0°) — interpolation HSL
    const hue = 120 - t * 120;
    const sat = 60 + t * 25;
    const light = 50 - t * 10;
    return `hsl(${hue} ${sat}% ${light}%)`;
  }
  // sequential : bleu primary AES, opacité variable mais hue stable
  const light = 55 - t * 25;
  return `hsl(212 70% ${light}%)`;
}

export function MaliHeatmap({
  data,
  tone = 'sequential',
  width = 480,
  minRadius = 2,
  maxRadius = 14,
  onRegionClick,
  ariaLabel = 'Carte du Mali — activité par région',
  className,
}: MaliHeatmapProps) {
  const height = width * 0.75;
  const maxValue = Math.max(1, ...data.map((d) => d.value));

  const byCode = React.useMemo(() => {
    const m = new Map<string, MaliHeatmapDatum>();
    data.forEach((d) => m.set(d.regionCode, d));
    return m;
  }, [data]);

  return (
    <svg
      viewBox="0 0 100 75"
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel}
      className={cn('h-auto max-w-full select-none', className)}
    >
      <title>{ariaLabel}</title>

      {/* Outline approximative du Mali (bbox du pays — pas un vrai contour) */}
      <rect
        x="0"
        y="0"
        width="100"
        height="75"
        fill="var(--bg-muted)"
        fillOpacity="0.3"
        stroke="var(--border)"
        strokeWidth="0.2"
        rx="1"
      />

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
            onClick={
              clickable ? () => onRegionClick({ ...datum, name: r.name }) : undefined
            }
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

      {/* Étiquettes des régions principales (zoom-out lisibilité) */}
      {(['ML-09', 'ML-01', 'ML-05', 'ML-07', 'ML-08'] as const).map((code) => {
        const r = MALI_REGIONS.find((x) => x.code === code);
        if (!r) return null;
        const { x, y } = project(r.lon, r.lat);
        const shortName = r.name.replace('District de ', '');
        return (
          <text
            key={`label-${code}`}
            x={x}
            y={y - 3}
            fontSize="2.2"
            textAnchor="middle"
            fill="var(--fg)"
            fillOpacity="0.85"
            className="pointer-events-none font-medium"
          >
            {shortName}
          </text>
        );
      })}
    </svg>
  );
}
