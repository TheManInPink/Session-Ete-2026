/**
 * @file        openapi-base.holder.ts
 * @description Petit conteneur partagé pour la spec OpenAPI NATIVE du gateway.
 *              Seul `main.ts` possède l'instance Nest nécessaire pour générer ce
 *              document (`SwaggerModule.createDocument`) ; il le dépose ici après
 *              le bootstrap. L'{@link AggregatorService} et le
 *              GatewayMetaController le lisent ensuite pour fonder l'agrégat.
 *
 * @module      api-gateway/aggregator
 */
import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

@Injectable()
export class OpenApiBaseHolder {
  private base: OpenAPIObject | null = null;

  /** Dépose la spec native (appelé une fois au bootstrap). */
  set(doc: OpenAPIObject): void {
    this.base = doc;
  }

  /**
   * Renvoie la spec native, ou une base minimale si le bootstrap ne l'a pas
   * encore déposée (ex. contexte de test sans Swagger).
   */
  get(): OpenAPIObject {
    return this.base ?? OpenApiBaseHolder.minimal();
  }

  /** Base OpenAPI minimale de repli. */
  private static minimal(): OpenAPIObject {
    return {
      openapi: '3.1.0',
      info: { title: 'NINA-AES API Gateway', version: '1.0.0' },
      paths: {},
      components: { schemas: {} },
      tags: [],
    } as OpenAPIObject;
  }
}
