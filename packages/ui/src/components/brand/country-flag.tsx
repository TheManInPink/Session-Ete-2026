/**
 * @file        country-flag.tsx
 * @description Drapeaux SVG officiels des 3 pays de l'Alliance des États du Sahel
 *              (Mali, Burkina Faso, Niger).
 *
 *              Pourquoi un composant SVG plutôt que l'emoji `🇲🇱` :
 *                - rendu cohérent sur TOUS les OS/navigateurs (les emojis drapeaux
 *                  sont absents sous Windows, où ils s'affichent en « ML/BF/NE ») ;
 *                - net à n'importe quelle taille (vecteur) ;
 *                - contrôle a11y explicite (décoratif vs annoncé).
 *
 *              Les couleurs sont les couleurs OFFICIELLES des drapeaux d'État,
 *              codées en dur : ce sont des symboles souverains, non thématisables
 *              (identiques en clair et en sombre).
 *
 * @module      @nina-aes/ui
 */

import * as React from 'react';
import { cn } from '../../lib/utils';

/** Code ISO-3 des 3 pays de l'AES. */
export type AESCountryCode = 'MLI' | 'BFA' | 'NER';

const COUNTRY_LABELS: Record<AESCountryCode, string> = {
  MLI: 'Mali',
  BFA: 'Burkina Faso',
  NER: 'Niger',
};

export interface CountryFlagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pays AES à afficher. */
  country: AESCountryCode;
  /** Largeur en px ; la hauteur est dérivée du ratio 3:2. Défaut 20. */
  size?: number;
  /** Coins arrondis (défaut `true`). */
  rounded?: boolean;
  /**
   * Libellé accessible (posé en `aria-label`, rôle `img`). Absent → le drapeau
   * est purement décoratif (`aria-hidden`), à utiliser quand un libellé pays
   * adjacent porte déjà l'information (cas des sélecteurs).
   */
  label?: string;
}

/** Contenu SVG (bandes + emblème) par pays — couleurs officielles. */
const FLAGS: Record<AESCountryCode, React.ReactElement> = {
  // Mali — tricolore vertical vert / or / rouge.
  MLI: (
    <>
      <rect x="0" y="0" width="8" height="16" fill="#14B53A" />
      <rect x="8" y="0" width="8" height="16" fill="#FCD116" />
      <rect x="16" y="0" width="8" height="16" fill="#CE1126" />
    </>
  ),
  // Burkina Faso — rouge (haut) / vert (bas) + étoile d'or à 5 branches au centre.
  BFA: (
    <>
      <rect x="0" y="0" width="24" height="8" fill="#EF2B2D" />
      <rect x="0" y="8" width="24" height="8" fill="#009E49" />
      <path
        d="M12 4.8 L12.72 7.01 L15.04 7.01 L13.16 8.38 L13.88 10.59 L12 9.22 L10.12 10.59 L10.84 8.38 L8.96 7.01 L11.28 7.01 Z"
        fill="#FCD116"
      />
    </>
  ),
  // Niger — orange / blanc / vert + disque orange au centre.
  NER: (
    <>
      <rect x="0" y="0" width="24" height="5.34" fill="#E05206" />
      <rect x="0" y="5.33" width="24" height="5.34" fill="#FFFFFF" />
      <rect x="0" y="10.66" width="24" height="5.34" fill="#0DB02B" />
      <circle cx="12" cy="8" r="2.4" fill="#E05206" />
    </>
  ),
};

/**
 * Drapeau vectoriel d'un pays de l'AES (Mali / Burkina Faso / Niger).
 *
 * @example Décoratif (libellé pays adjacent) : `<CountryFlag country="MLI" />`
 * @example Annoncé (seul porteur d'info)     : `<CountryFlag country="MLI" label="Mali" />`
 */
export function CountryFlag({
  country,
  size = 20,
  rounded = true,
  label,
  className,
  style,
  ...props
}: CountryFlagProps) {
  const height = Math.round((size * 2) / 3); // ratio 3:2
  const decorative = label === undefined;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 overflow-hidden align-middle',
        rounded && 'rounded-[2px]',
        className,
      )}
      // Bord subtil neutre : détache le drapeau des fonds blancs (bande blanche
      // du Niger) comme sombres. `overflow-hidden` + border-radius clippe les coins.
      style={{
        width: size,
        height,
        boxShadow: 'inset 0 0 0 0.5px rgba(120,120,120,0.4)',
        ...style,
      }}
      {...props}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (label ?? COUNTRY_LABELS[country])}
      aria-hidden={decorative ? true : undefined}
    >
      <svg width={size} height={height} viewBox="0 0 24 16" focusable="false" aria-hidden="true">
        {FLAGS[country]}
      </svg>
    </span>
  );
}
CountryFlag.displayName = 'CountryFlag';
