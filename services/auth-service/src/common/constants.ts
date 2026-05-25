/**
 * @file        constants.ts
 * @description Constantes partagées du auth-service.
 *              Durées TTL, clés Redis, codes d'erreur — centralisés ici pour
 *              éviter la dérive entre modules et faciliter le tuning ops.
 * @module      auth-service/common
 */

/** Préfixes Redis (concaténés à `REDIS_KEY_PREFIX` env, par défaut `auth:`). */
export const REDIS_KEYS = {
  /** Refresh token actif : `auth:rt:<jti>` → JSON { userId, role, family, expiresAt } */
  refreshToken: (jti: string) => `rt:${jti}`,
  /** Famille de refresh tokens (détection de rejeu après rotation) : `auth:rt-family:<userId>:<familyId>` */
  refreshFamily: (userId: string, familyId: string) => `rt-family:${userId}:${familyId}`,
  /** OTP register (téléphone → code) : `auth:otp:register:<phone>` */
  otpRegister: (phone: string) => `otp:register:${phone}`,
  /** OTP MFA SMS (userId → code) : `auth:otp:mfa:<userId>` */
  otpMfa: (userId: string) => `otp:mfa:${userId}`,
  /** Secret TOTP pending (avant confirmation) : `auth:mfa:totp:pending:<userId>` */
  mfaTotpPending: (userId: string) => `mfa:totp:pending:${userId}`,
  /** jti d'un challenge MFA consommé : `auth:mfa:challenge:<jti>` (présent = invalidé). */
  mfaChallengeUsed: (jti: string) => `mfa:challenge:${jti}`,
  /** jti d'un token de reset password actif : `auth:reset:<jti>` */
  resetJti: (jti: string) => `reset:${jti}`,
  /** Compteur de rate-limit login : `auth:throttle:login:<ip>` */
  throttleLogin: (ip: string) => `throttle:login:${ip}`,
} as const;

/** TTL Redis par défaut (en secondes) — overridable via env si besoin. */
export const TTL = {
  /** OTP de register (SMS) : 5 minutes. */
  otpRegisterSeconds: 300,
  /** OTP MFA SMS : 5 minutes. */
  otpMfaSeconds: 300,
  /** Lifetime maximum d'une famille de refresh tokens (= JWT_REFRESH_TTL_SECONDS). */
  refreshFamilySeconds: 604_800,
  /** Secret TOTP en attente de confirmation (10 min suffit pour scanner + confirmer). */
  mfaTotpPendingSeconds: 600,
  /** Durée maximale pendant laquelle on garde le jti d'un challenge comme « consommé ». */
  mfaChallengeUsedSeconds: 900,
} as const;

/** Codes d'erreur retournés par l'API (alignés sur OWASP — pas de fuite d'info user enum). */
export const AUTH_ERRORS = {
  /** Credentials invalides — message unique pour login KO (anti user-enum). */
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  /** Compte verrouillé par rate-limit. */
  TOO_MANY_ATTEMPTS: 'AUTH_TOO_MANY_ATTEMPTS',
  /** MFA requis pour ce rôle, code non fourni / invalide. */
  MFA_REQUIRED: 'AUTH_MFA_REQUIRED',
  /** Token expiré ou révoqué. */
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  /** OTP SMS invalide ou expiré (register / MFA). */
  OTP_INVALID: 'AUTH_OTP_INVALID',
  /** Détection de rejeu d'un refresh token (toute la famille est révoquée). */
  REFRESH_REPLAY_DETECTED: 'AUTH_REFRESH_REPLAY_DETECTED',
} as const;

export type AuthErrorCode = (typeof AUTH_ERRORS)[keyof typeof AUTH_ERRORS];
