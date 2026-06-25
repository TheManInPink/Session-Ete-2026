/**
 * @file        index.ts
 * @description Barrel des guards d'authentification/autorisation LOCAUX à
 *              identity-service (cf. ADR-027 : classes `@Injectable()` locales).
 * @module      identity-service/auth/guards
 */
export * from './jwt-auth.guard';
export * from './roles.guard';
export * from './nina-ownership.guard';
