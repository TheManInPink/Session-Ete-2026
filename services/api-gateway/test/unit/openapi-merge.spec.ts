/**
 * @file        openapi-merge.spec.ts
 * @description Tests de la fusion OpenAPI : préfixe public des chemins,
 *              namespacing des schémas, réécriture des $ref, tags par service,
 *              préservation de la base, absence de collision de schémas.
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  mergeOpenApiDocuments,
  type DownstreamSpec,
} from '../../src/modules/aggregator/openapi-merge.js';

function base(): OpenAPIObject {
  return {
    openapi: '3.1.0',
    info: { title: 'Gateway', version: '1.0.0' },
    paths: { '/health': { get: { responses: { '200': { description: 'ok' } } } } },
    components: { schemas: {} },
    tags: [],
  } as unknown as OpenAPIObject;
}

/** Deux services partageant un schéma nommé `Foo` → collision à namespacer. */
function specWith(serviceName: string): DownstreamSpec {
  return {
    serviceName,
    spec: {
      openapi: '3.1.0',
      info: { title: serviceName, version: '1.0.0' },
      paths: {
        '/items': {
          get: {
            tags: ['old'],
            responses: {
              '200': {
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Foo' } } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Foo: { type: 'object', properties: { bar: { $ref: '#/components/schemas/Bar' } } },
          Bar: { type: 'string' },
        },
      },
    } as unknown as OpenAPIObject,
  };
}

describe('mergeOpenApiDocuments', () => {
  const merged = mergeOpenApiDocuments(base(), [specWith('identity'), specWith('auth')]);

  it('préfixe les chemins aval par /api/v1', () => {
    expect(merged.paths['/api/v1/items']).toBeDefined();
    expect(merged.paths['/items']).toBeUndefined();
  });

  it('préserve les chemins natifs de la base', () => {
    expect(merged.paths['/health']).toBeDefined();
  });

  it('namespace les schémas pour éviter les collisions Foo↔Foo', () => {
    const schemas = merged.components!.schemas!;
    expect(schemas['Identity_Foo']).toBeDefined();
    expect(schemas['Auth_Foo']).toBeDefined();
    expect(schemas['Foo']).toBeUndefined();
  });

  it('réécrit les $ref internes vers les schémas namespacés', () => {
    const schemas = merged.components!.schemas! as Record<
      string,
      { properties?: { bar?: { $ref?: string } } }
    >;
    expect(schemas['Identity_Foo']?.properties?.bar?.$ref).toBe(
      '#/components/schemas/Identity_Bar',
    );
  });

  it('réécrit les $ref dans les opérations de chemin', () => {
    const op = merged.paths['/api/v1/items'] as unknown as {
      get: {
        responses: { '200': { content: { 'application/json': { schema: { $ref: string } } } } };
      };
    };
    const ref = op.get.responses['200'].content['application/json'].schema.$ref;
    // Le chemin appartient au DERNIER service fusionné qui a écrit cette clé (auth).
    expect(ref).toBe('#/components/schemas/Auth_Foo');
  });

  it('retague chaque opération avec le nom du service', () => {
    const op = merged.paths['/api/v1/items'] as { get: { tags: string[] } };
    expect(op.get.tags).toContain('auth');
    expect(op.get.tags).not.toContain('old');
  });

  it('ajoute un tag descriptif par service', () => {
    const names = (merged.tags ?? []).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['identity', 'auth']));
  });

  it('ne mute pas le document de base fourni', () => {
    const b = base();
    mergeOpenApiDocuments(b, [specWith('identity')]);
    expect(b.paths['/api/v1/items']).toBeUndefined();
  });
});
