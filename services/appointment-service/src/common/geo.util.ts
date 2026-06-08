/**
 * @file        geo.util.ts
 * @description Calcul de distance géographique (formule de Haversine).
 *
 *              Pourquoi côté application et non PostGIS : le nombre de centres
 *              d'enrôlement est petit (dizaines), donc charger les centres actifs
 *              et trier par distance en mémoire est simple, portable et évite de
 *              dépendre d'une requête PostGIS via le type Prisma `Unsupported`.
 *              Pour des milliers de points, basculer sur un index GiST PostGIS.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      appointment-service/common
 */

/** Rayon moyen de la Terre en kilomètres (sphère WGS84). */
const EARTH_RADIUS_KM = 6371;

/** Convertit des degrés en radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Distance orthodromique entre deux points (lat/lng en degrés décimaux), en km.
 *
 * @param lat1 Latitude du point A.
 * @param lng1 Longitude du point A.
 * @param lat2 Latitude du point B.
 * @param lng2 Longitude du point B.
 * @returns Distance en kilomètres (≥ 0).
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
