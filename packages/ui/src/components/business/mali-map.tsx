/**
 * @file        mali-map.tsx
 * @description Carte SVG interactive des régions du Mali (PC-04 / GOV).
 *
 *              Composant VOLONTAIREMENT PRÉSENTATIONNEL et props-driven : il ne
 *              fait NI fetch GeoJSON, NI projection, NI D3 en interne. C'est une
 *              déviation assumée vs la spec « D3 + GeoJSON » : la projection
 *              GeoJSON → tracé SVG (`<path d>`) et le dégradé de couleurs
 *              succès→danger (mode heatmap) vivent dans la couche app/données.
 *              Ce choix garde le composant souverain (aucune dépendance carto
 *              type Mapbox), testable et déterministe — l'app fournit déjà les
 *              tracés projetés (cf. la philosophie de `charts/mali-heatmap.tsx`,
 *              où la projection lon/lat est faite côté composant à partir de
 *              données souveraines).
 *
 *              Accessibilité : `<svg role="group">` ; chaque région est un
 *              `<path role="button">` focusable au clavier (Enter / Espace),
 *              avec `aria-pressed` reflétant la sélection et un anneau de focus
 *              visible.
 *
 * @module      @nina-aes/ui
 */

'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

/** Une région du Mali, déjà projetée en tracé SVG par la couche app/données. */
export interface MaliRegion {
  /** Identifiant stable de la région (ex. code ISO interne). */
  id: string;
  /** Libellé humain de la région (ex. « Sikasso »). */
  name: string;
  /** Donnée de tracé SVG, telle qu'utilisée par l'attribut `<path d>`. */
  d: string;
  /** Abscisse du centroïde pour l'étiquette optionnelle. */
  labelX?: number;
  /** Ordonnée du centroïde pour l'étiquette optionnelle. */
  labelY?: number;
}

export interface MaliMapProps {
  /** Régions à dessiner, chacune portant son tracé SVG projeté. */
  regions: MaliRegion[];
  /** Identifiant de la région actuellement sélectionnée. */
  selectedId?: string;
  /** Notifie la sélection (clic ou clavier) d'une région. */
  onSelect?: (id: string) => void;
  /** Cadrage du SVG ; doit correspondre au repère des tracés fournis. */
  viewBox?: string;
  /**
   * Mode de coloration :
   * - `'select'` : couleurs sémantiques du design system (primaire + opacité).
   * - `'heatmap'` : remplissage piloté par `getRegionColor` (couleur fournie
   *   par l'app, p. ex. un dégradé succès→danger calculé côté données).
   */
  variant?: 'select' | 'heatmap';
  /**
   * En mode `'heatmap'` : couleur CSS de remplissage pour une région donnée,
   * appliquée via `style={{ fill }}`. Le dégradé succès→danger et toute la
   * logique de seuils restent SOUVERAINS, côté app (pas de Mapbox, pas de D3).
   */
  getRegionColor?: (id: string) => string;
  /** Étiquette accessible globale de la carte. */
  ariaLabel?: string;
  /** Classes utilitaires supplémentaires sur le `<svg>`. */
  className?: string;
}

/**
 * Carte SVG interactive des régions du Mali.
 *
 * Présentationnelle et props-driven : on lui passe des régions déjà projetées
 * (`d`) ; elle gère uniquement le rendu, le survol, la sélection et l'a11y.
 */
export const MaliMap = React.forwardRef<SVGSVGElement, MaliMapProps>(
  (
    {
      regions,
      selectedId,
      onSelect,
      viewBox = '0 0 600 500',
      variant = 'select',
      getRegionColor,
      ariaLabel = 'Carte des régions du Mali',
      className,
    },
    ref,
  ) => (
    <svg
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      viewBox={viewBox}
      className={cn('h-auto w-full', className)}
    >
      {regions.map((r) => {
        const isSelected = r.id === selectedId;
        const isHeatmap = variant === 'heatmap';

        return (
          <React.Fragment key={r.id}>
            <path
              d={r.d}
              role="button"
              tabIndex={0}
              aria-label={`Région ${r.name}`}
              aria-pressed={isSelected}
              onClick={() => onSelect?.(r.id)}
              onKeyDown={(e) => {
                // Enter / Espace déclenchent la sélection (parité souris/clavier).
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(r.id);
                }
              }}
              // En mode heatmap, la couleur provient de l'app via `style.fill`.
              style={isHeatmap ? { fill: getRegionColor?.(r.id) } : undefined}
              className={cn(
                'cursor-pointer stroke-border [stroke-width:1.5] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                // Mode sélection : palette sémantique (primaire + opacité).
                !isHeatmap &&
                  (isSelected
                    ? 'fill-primary stroke-primary [stroke-width:2.5]'
                    : 'fill-primary/10 hover:fill-primary/30'),
                // Mode heatmap : la teinte est gérée en `style`, on n'ajoute
                // qu'un liseré de sélection visible.
                isHeatmap && isSelected && 'stroke-primary [stroke-width:2.5]',
              )}
            />
            {/* Étiquette centroïde optionnelle (non interactive). */}
            {r.labelX != null && r.labelY != null && (
              <text
                x={r.labelX}
                y={r.labelY}
                textAnchor="middle"
                className="pointer-events-none fill-fg text-[10px] font-medium"
              >
                {r.name}
              </text>
            )}
          </React.Fragment>
        );
      })}
    </svg>
  ),
);
MaliMap.displayName = 'MaliMap';
