/**
 * @file        openapi-merge.ts
 * @description Fusion PURE (sans I/O) de plusieurs specs OpenAPI aval en une
 *              seule, exposée par le gateway. Isolée du service réseau pour être
 *              testable unitairement avec des fixtures (aucun downstream requis).
 *
 *              RÈGLES DE FUSION :
 *                1. Chemins : préfixés par le préfixe public du gateway
 *                   (`/api/v1`) car les specs aval sont générées AVANT
 *                   l'application du global prefix (paths = `/citizens`, pas
 *                   `/api/v1/citizens`). On reconstitue donc l'URL publique.
 *                2. Schémas : préfixés par le nom du service
 *                   (`Identity_CreateCitizenDto`) pour éviter les collisions ;
 *                   tous les `$ref` correspondants sont réécrits (égalité
 *                   EXACTE de chaîne ⇒ pas de faux positif sur un préfixe commun).
 *                3. Tags : chaque opération reçoit le tag du service d'origine,
 *                   pour un regroupement lisible dans Swagger UI.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      api-gateway/aggregator
 */
import type { OpenAPIObject } from '@nestjs/swagger';

/** Une spec aval à fusionner, étiquetée par son service. */
export interface DownstreamSpec {
  /** Nom du service (ex. `identity`) — sert de tag et de namespace de schéma. */
  serviceName: string;
  /** Document OpenAPI brut récupéré depuis `${base}/api/docs-json`. */
  spec: OpenAPIObject;
}

/** Première lettre en majuscule (pour préfixer les noms de schémas). */
function pascal(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Réécrit récursivement toute valeur `$ref` correspondant exactement à une
 * ancienne référence de schéma vers sa nouvelle référence namespacée.
 *
 * @param node Nœud courant (objet/tableau/primitive).
 * @param refMap Table `ancien $ref → nouveau $ref` (chaînes complètes).
 * @returns Le nœud avec ses `$ref` réécrits.
 */
function rewriteRefs(node: unknown, refMap: Map<string, string>): unknown {
  if (Array.isArray(node)) return node.map((n) => rewriteRefs(n, refMap));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string' && refMap.has(v)) {
        out[k] = refMap.get(v);
      } else {
        out[k] = rewriteRefs(v, refMap);
      }
    }
    return out;
  }
  return node;
}

/**
 * Fusionne `base` (la spec native du gateway) avec les specs des services aval.
 *
 * @param base Spec OpenAPI du gateway (health, gateway-meta).
 * @param parts Specs aval étiquetées.
 * @param publicPrefix Préfixe public du gateway à recoller (ex. `/api/v1`).
 * @returns Une spec OpenAPI unique agrégée.
 */
export function mergeOpenApiDocuments(
  base: OpenAPIObject,
  parts: readonly DownstreamSpec[],
  publicPrefix = '/api/v1',
): OpenAPIObject {
  // Clone défensif de la base — on ne mute jamais l'entrée.
  const merged: OpenAPIObject = JSON.parse(JSON.stringify(base)) as OpenAPIObject;
  merged.paths = merged.paths ?? {};
  merged.components = merged.components ?? {};
  merged.components.schemas = merged.components.schemas ?? {};
  merged.tags = merged.tags ?? [];

  for (const { serviceName, spec } of parts) {
    const ns = pascal(serviceName);

    // 1. Table de réécriture des $ref de schémas pour CE service.
    const refMap = new Map<string, string>();
    for (const schemaName of Object.keys(spec.components?.schemas ?? {})) {
      refMap.set(`#/components/schemas/${schemaName}`, `#/components/schemas/${ns}_${schemaName}`);
    }

    // 2. Schémas namespacés (avec $ref internes réécrits).
    for (const [schemaName, schema] of Object.entries(spec.components?.schemas ?? {})) {
      merged.components!.schemas![`${ns}_${schemaName}`] = rewriteRefs(schema, refMap) as never;
    }

    // 3. Chemins : préfixe public + tag de service + $ref réécrits.
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      const publicPath = `${publicPrefix}${path}`;
      const rewritten = rewriteRefs(pathItem, refMap) as Record<string, unknown>;
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
        const op = rewritten[method] as { tags?: string[] } | undefined;
        if (op && typeof op === 'object') {
          op.tags = [serviceName];
        }
      }
      merged.paths[publicPath] = rewritten as never;
    }

    // 4. Tag descriptif du service.
    if (!merged.tags.some((t) => t.name === serviceName)) {
      merged.tags.push({
        name: serviceName,
        description: `Routes proxifiées → ${serviceName}-service`,
      });
    }
  }

  return merged;
}
