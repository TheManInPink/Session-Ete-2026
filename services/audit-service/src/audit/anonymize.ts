/**
 * @file        anonymize.ts
 * @description Primitives PURES d'anti-désanonymisation (THREAT-MODEL #12).
 *
 *              Le journal d'audit persiste `ipAddress` (INET) et `correlationId`
 *              par entrée. Couplés au scellement horaire (timing précis), un
 *              initié / DBA pourrait désanonymiser un LANCEUR D'ALERTE en
 *              croisant IP + correlationId + horodatage. Contre-mesure :
 *
 *                - IP : TRONQUÉE au préfixe réseau (host masqué). On garde un
 *                  INET VALIDE (/24 IPv4, /48 IPv6) → la détection SOC par
 *                  sous-réseau reste possible, mais l'hôte individuel disparaît.
 *                - correlationId : HACHÉ (SHA-256 tronqué + pepper serveur). Le
 *                  SOC corrèle deux events par hash sans voir la valeur brute ;
 *                  le pepper empêche l'attaque par dictionnaire d'UUID.
 *
 *              Le hachage est DÉTERMINISTE (même entrée → même hash) : la
 *              corrélation SOC légitime n'est pas cassée. Volontairement SANS
 *              dépendance NestJS (testable + réutilisable).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      audit-service/audit
 */
import { sha256Hex } from './chain.js';

/** Préfixe marquant un correlationId haché (lisible côté SOC, non réversible). */
const HASHED_CORRELATION_PREFIX = 'h:';

/**
 * Détermine si un événement est sur un chemin SENSIBLE (lanceur d'alerte / SIGAC)
 * d'après sa routing key et la liste de préfixes configurée.
 *
 * @param routingKey       Clé de routage AMQP de l'événement.
 * @param sensitivePrefixes Préfixes sensibles (ex. `['vulnerability.']`).
 */
export function isSensitiveRoute(routingKey: string, sensitivePrefixes: string[]): boolean {
  if (!routingKey) return false;
  return sensitivePrefixes.some((p) => p.length > 0 && routingKey.startsWith(p));
}

/**
 * Tronque une adresse IP à son préfixe réseau pour casser l'identification de
 * l'hôte tout en restant un INET VALIDE (corrélation par sous-réseau préservée).
 *
 *  - IPv4 : conserve les 3 premiers octets, dernier octet à 0 (/24).
 *    `41.221.10.37` → `41.221.10.0`
 *  - IPv6 : conserve les 3 premiers groupes (/48), reste à `::`.
 *    `2001:db8:abcd:1234::1` → `2001:db8:abcd::`
 *
 * @param ip Adresse IP brute (déjà validée INET) ou `null`.
 * @returns IP tronquée (INET valide) ou `null`.
 */
export function truncateIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.') && !ip.includes(':')) {
    // IPv4
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ip.includes(':')) {
    // IPv6 — garde les 3 premiers groupes significatifs (gère la forme `::`).
    const groups = ip.split(':').filter((g) => g.length > 0);
    const kept = groups.slice(0, 3);
    if (kept.length === 0) return '::';
    return `${kept.join(':')}::`;
  }
  return null;
}

/**
 * Hache un `correlationId` (SHA-256 tronqué 32 hex + pepper serveur) en préservant
 * le déterminisme (corrélation SOC) sans exposer la valeur brute.
 *
 * @param correlationId Valeur brute ou `null`.
 * @param pepper        Poivre serveur (jamais journalisé).
 * @returns `h:<hash32>` (≤ 100 chars, compatible VarChar(100)) ou `null`.
 */
export function hashCorrelationId(correlationId: string | null, pepper: string): string | null {
  if (!correlationId) return null;
  const digest = sha256Hex(`${pepper}|${correlationId}`).slice(0, 32);
  return `${HASHED_CORRELATION_PREFIX}${digest}`;
}
