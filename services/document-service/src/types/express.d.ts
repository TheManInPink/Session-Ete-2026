/**
 * @file        express.d.ts
 * @description Augmentation du type `Request.user` injecté par JwtAuthGuard
 *              (cf. @nina-aes/auth-guards). Le guard attache un AuthSubject
 *              après validation du Bearer token.
 *
 * @module      document-service/types
 */
import type { AuthSubject } from '@nina-aes/auth-guards';

declare global {
  namespace Express {
    interface Request {
      user?: AuthSubject;
    }
  }
}

export {};
