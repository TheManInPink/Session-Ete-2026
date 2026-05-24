/**
 * @file        proxy.routes.ts
 * @description Table de routage centrale du gateway.
 *
 *              CHAQUE entrée mappe un préfixe URL public vers un service
 *              interne. La table est statique (compile-time) pour des raisons
 *              de PERFORMANCE et de SÉCURITÉ : impossible d'ajouter une route
 *              dynamiquement, ce qui prévient les attaques par injection de
 *              routes.
 *
 *              AJOUT D'UN NOUVEAU SERVICE :
 *              1. Ajouter une entrée ici
 *              2. Ajouter dans CRITICAL_DOWNSTREAMS de health.controller.ts
 *                 si nécessaire
 *              3. Mettre à jour docs/PROMPT-MAITRE-v3.md Annexe B
 *
 * @module      api-gateway/proxy
 */

/**
 * Définition d'une route du gateway.
 */
export interface GatewayRoute {
  /** Préfixe public — ex. `/api/v1/citizens` */
  publicPrefix: string;
  /** URL interne du service — ex. `http://identity-service:3001` */
  targetBaseUrl: string;
  /** Nom du service (pour logs et métriques) */
  serviceName: string;
  /** Routes ne nécessitant PAS de JWT (callbacks, health publics). */
  publicEndpoints?: readonly string[];
  /** Timeout spécifique au service (ms) — défaut 5000. */
  timeoutMs?: number;
}

/**
 * Table de routage — alignée sur l'Annexe B du PROMPT v3.0.
 *
 * ⚠️ Ordre IMPORTANT : les préfixes plus spécifiques DOIVENT être avant
 *    les plus généraux pour que le matcher trouve la bonne entrée en premier.
 */
export const GATEWAY_ROUTES: readonly GatewayRoute[] = [
  {
    publicPrefix: '/api/v1/citizens',
    targetBaseUrl: getEnvOr('IDENTITY_SERVICE_URL', 'http://identity-service:3001'),
    serviceName: 'identity',
  },
  {
    publicPrefix: '/api/v1/corrections',
    targetBaseUrl: getEnvOr('IDENTITY_SERVICE_URL', 'http://identity-service:3001'),
    serviceName: 'identity',
  },
  {
    publicPrefix: '/api/v1/locations',
    targetBaseUrl: getEnvOr('IDENTITY_SERVICE_URL', 'http://identity-service:3001'),
    serviceName: 'identity',
  },
  {
    publicPrefix: '/api/v1/auth',
    targetBaseUrl: getEnvOr('AUTH_SERVICE_URL', 'http://auth-service:3002'),
    serviceName: 'auth',
    publicEndpoints: ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh'],
  },
  {
    publicPrefix: '/api/v1/ai',
    targetBaseUrl: getEnvOr('AI_SERVICE_URL', 'http://ai-service:3003'),
    serviceName: 'ai',
    timeoutMs: 15000, // L'IA peut prendre du temps (OCR, NER)
  },
  {
    publicPrefix: '/api/v1/documents',
    targetBaseUrl: getEnvOr('DOCUMENT_SERVICE_URL', 'http://document-service:3004'),
    serviceName: 'document',
    timeoutMs: 30000, // Génération PDF longue
  },
  {
    publicPrefix: '/api/v1/notifications',
    targetBaseUrl: getEnvOr('NOTIFICATION_SERVICE_URL', 'http://notification-service:3005'),
    serviceName: 'notification',
  },
  {
    publicPrefix: '/api/v1/aes',
    targetBaseUrl: getEnvOr('INTEROP_SERVICE_URL', 'http://interop-service:3006'),
    serviceName: 'interop',
  },
  {
    publicPrefix: '/api/v1/audit',
    targetBaseUrl: getEnvOr('AUDIT_SERVICE_URL', 'http://audit-service:3007'),
    serviceName: 'audit',
  },
  {
    publicPrefix: '/api/v1/appointments',
    targetBaseUrl: getEnvOr('APPOINTMENT_SERVICE_URL', 'http://appointment-service:3008'),
    serviceName: 'appointment',
  },
  {
    publicPrefix: '/api/v1/sigac',
    targetBaseUrl: getEnvOr('ANTICORRUPTION_SERVICE_URL', 'http://anticorruption-service:3009'),
    serviceName: 'anticorruption',
    publicEndpoints: ['/api/v1/sigac/alerts', '/api/v1/sigac/alerts/status'],
  },
  {
    publicPrefix: '/api/v1/governance',
    targetBaseUrl: getEnvOr('GOVERNANCE_SERVICE_URL', 'http://governance-service:3010'),
    serviceName: 'governance',
  },
  {
    publicPrefix: '/api/v1/vulnerable',
    targetBaseUrl: getEnvOr('VULNERABILITY_SERVICE_URL', 'http://vulnerability-service:3011'),
    serviceName: 'vulnerability',
  },
  {
    publicPrefix: '/api/v1/enrollment',
    targetBaseUrl: getEnvOr('ENROLLMENT_SERVICE_URL', 'http://enrollment-service:3013'),
    serviceName: 'enrollment',
  },
  {
    publicPrefix: '/api/v1/ussd',
    targetBaseUrl: getEnvOr('USSD_SERVICE_URL', 'http://ussd-service:3014'),
    serviceName: 'ussd',
    publicEndpoints: ['/api/v1/ussd/callback'], // Webhook Africa's Talking sans auth
  },
];

/** Helper local : récupère une variable d'environnement avec fallback. */
function getEnvOr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/**
 * Trouve la route correspondant à un chemin HTTP entrant.
 *
 * @param path - Chemin de la requête (ex. `/api/v1/citizens/123`).
 * @returns La route match ou `undefined` si aucune.
 */
export function matchRoute(path: string): GatewayRoute | undefined {
  // Recherche linéaire — la table fait 16 entrées max, suffisamment rapide.
  // Si un jour la table explose, passer à un trie préfixe.
  return GATEWAY_ROUTES.find((r) => path.startsWith(r.publicPrefix));
}

/**
 * Vérifie si un endpoint est public (pas besoin de JWT).
 */
export function isPublicEndpoint(path: string, route: GatewayRoute): boolean {
  return route.publicEndpoints?.some((ep) => path.startsWith(ep)) ?? false;
}
