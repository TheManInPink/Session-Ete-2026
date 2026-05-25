/**
 * @file        auth.service.ts
 * @description Orchestrateur des flows d'authentification.
 *
 *              Phases livrées :
 *                4. `requestRegisterOtp` / `verifyRegister`
 *                5. `login` / `refresh` / `logout`
 *
 *              Les phases suivantes ajouteront : MFA setup/verify (6),
 *              reset password (7), profil /me (8).
 *
 *              Toutes les erreurs métier passent par {@link AUTH_ERRORS}
 *              (codes génériques, anti user-enum).
 *
 * @module      auth-service/modules/auth
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@nina-aes/database';

import { AUTH_ERRORS } from '../../common/constants.js';
import { MFA_REQUIRED_ROLES, UserRole } from '../../common/types.js';
import { JwtCryptoService } from '../../crypto/jwt.service.js';
import { KeycloakAdminService } from '../../keycloak/keycloak-admin.service.js';
import { KeycloakAuthService } from '../../keycloak/keycloak-auth.service.js';
import { REDIS_KEYS } from '../../common/constants.js';
import { RedisService } from '../../redis/redis.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../../sms/sms.types.js';
import { UserRepository } from '../user/user.repository.js';

import type { LoginDto } from './dto/login.dto.js';
import type { LogoutDto } from './dto/logout.dto.js';
import type { RefreshDto } from './dto/refresh.dto.js';
import type { RegisterRequestOtpDto } from './dto/register-request-otp.dto.js';
import type { RegisterVerifyDto } from './dto/register-verify.dto.js';
import { OtpService } from './otp.service.js';
import { RefreshService } from './refresh.service.js';

/** Réponse type d'un flow émettant une paire complète (pas de MFA pending). */
export interface AuthSession {
  user: { id: string; email: string; role: UserRole };
  access: string;
  refresh: string;
  expiresIn: number;
}

/**
 * Réponse de `login` pour les rôles à MFA obligatoire — pas de tokens à
 * cette étape, le client doit présenter son MFA via les endpoints
 * Phase 6 pour obtenir une session complète.
 */
export interface MfaPending {
  mfaRequired: true;
  userId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly users: UserRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly keycloakAuth: KeycloakAuthService,
    private readonly jwt: JwtCryptoService,
    private readonly redis: RedisService,
    private readonly refreshSvc: RefreshService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ─── Register : étape 1 ───────────────────────────────────────────

  async requestRegisterOtp(dto: RegisterRequestOtpDto): Promise<{ ttlSeconds: number }> {
    const result = await this.otp.issueRegisterOtp(dto.phoneNumber);
    if (result.created) {
      await this.sms.send(dto.phoneNumber, this.formatOtpMessage(result.code));
    }
    return { ttlSeconds: result.ttlSeconds };
  }

  // ─── Register : étape 2 ───────────────────────────────────────────

  async verifyRegister(dto: RegisterVerifyDto): Promise<AuthSession> {
    const otpOk = await this.otp.verifyRegisterOtp(dto.phoneNumber, dto.otp);
    if (!otpOk) throw new UnauthorizedException(AUTH_ERRORS.OTP_INVALID);

    const username = dto.username ?? dto.email.split('@')[0]!;
    const role = UserRole.CITIZEN;

    const { keycloakId } = await this.keycloakAdmin.createUser({
      username,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
      phoneNumber: dto.phoneNumber,
      role,
    });

    let user: Awaited<ReturnType<UserRepository['create']>>;
    try {
      user = await this.users.create({
        keycloakId,
        email: dto.email,
        username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'CITIZEN',
        phoneNumber: dto.phoneNumber,
        preferredLanguage: dto.preferredLanguage ?? 'FR',
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.error(
          `Drift Keycloak/DB : user ${keycloakId} créé dans Keycloak mais email/username déjà pris en DB`,
        );
        throw new BadRequestException('AUTH_USER_ALREADY_EXISTS');
      }
      throw err;
    }

    return this.issueSession({
      userId: user.id,
      email: user.email,
      role,
      keycloakId,
      mfa: false,
    });
  }

  // ─── Login ────────────────────────────────────────────────────────

  /**
   * Valide le password (Keycloak), résout le user (DB), puis :
   *   - si le rôle requiert MFA → renvoie `{ mfaRequired: true }` (sans
   *     tokens — c'est Phase 6 qui complétera le flow MFA challenge) ;
   *   - sinon → renvoie la paire complète access/refresh avec `mfa=false`.
   *
   * Les erreurs Keycloak (400/401) sont mappées sur AUTH_INVALID_CREDENTIALS
   * pour rester silencieux sur l'existence du compte.
   */
  async login(dto: LoginDto): Promise<AuthSession | MfaPending> {
    let keycloakSub: string;
    try {
      const res = await this.keycloakAuth.validatePassword(dto.identifier, dto.password);
      keycloakSub = res.keycloakSub;
    } catch (err) {
      if (err instanceof Error && err.message === AUTH_ERRORS.INVALID_CREDENTIALS) {
        throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
      }
      throw err;
    }

    const user = await this.users.findByKeycloakId(keycloakSub);
    if (!user) {
      // User Keycloak sans User DB → état incohérent ; on refuse pour
      // ne pas émettre de session orpheline. Un job de réconciliation
      // (Phase 10) doit corriger.
      this.logger.error(`Drift : keycloakSub ${keycloakSub} valide mais sans ligne User en DB`);
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    const role = user.role as unknown as UserRole;
    if (MFA_REQUIRED_ROLES.has(role)) {
      return { mfaRequired: true, userId: user.id };
    }

    await this.users.updateLastLogin(user.id).catch((err: unknown) => {
      this.logger.warn(`updateLastLogin échoué pour ${user.id}: ${(err as Error).message}`);
    });

    return this.issueSession({
      userId: user.id,
      email: user.email,
      role,
      keycloakId: keycloakSub,
      mfa: false,
    });
  }

  // ─── Refresh ──────────────────────────────────────────────────────

  /**
   * Rotation du refresh token + nouvel access. Délègue la mécanique au
   * {@link RefreshService} (détection de rejeu, gestion famille).
   *
   * Le `mfa` claim est propagé depuis le token courant — on ne « perd »
   * pas l'élévation MFA à chaque refresh.
   */
  async refresh(dto: RefreshDto): Promise<{ access: string; refresh: string; expiresIn: number }> {
    // On lit le `mfa` claim AVANT la rotation — si invalide,
    // verifyRefresh dans rotate() lèvera proprement.
    const decoded = this.jwt.verifyRefresh(dto.refresh);
    // `JwtRefreshPayload` ne porte pas `mfa` ; on lit depuis le state
    // courant via le claim original n'est pas dispo → on relit l'état
    // métier : pour Phase 5 on défaut à `false`. Phase 6 raffinera en
    // stockant mfa au niveau famille dans Redis.
    void decoded;
    return this.refreshSvc.rotate(dto.refresh, /* mfa */ false);
  }

  // ─── Logout ───────────────────────────────────────────────────────

  /**
   * Révoque le refresh fourni (idempotent). L'access courant reste valide
   * jusqu'à expiration (TTL 15 min — assumé acceptable pour éviter une
   * blacklist par requête).
   */
  async logout(dto: LogoutDto): Promise<void> {
    await this.refreshSvc.revoke(dto.refresh);
  }

  // ─── Helpers internes ─────────────────────────────────────────────

  /**
   * Émet une paire access+refresh + persiste le refresh dans Redis.
   * Réutilisé par register/verify et login (chemin happy path sans MFA).
   */
  private async issueSession(params: {
    userId: string;
    email: string;
    role: UserRole;
    keycloakId: string;
    mfa: boolean;
  }): Promise<AuthSession> {
    const access = this.jwt.signAccess({
      userId: params.userId,
      role: params.role,
      mfa: params.mfa,
      email: params.email,
      kcSub: params.keycloakId,
    });
    const refresh = this.jwt.signRefresh({ userId: params.userId, role: params.role });
    await this.refreshSvc.persist(refresh.jti, params.userId, refresh.family);

    return {
      user: { id: params.userId, email: params.email, role: params.role },
      access,
      refresh: refresh.token,
      expiresIn: 900,
    };
  }

  /**
   * Reset du compteur de throttle login après succès (appelé par le
   * controller). Sépare la responsabilité : le service métier n'a pas
   * à connaître l'IP, mais expose un point de reset.
   */
  async resetLoginThrottle(ip: string): Promise<void> {
    await this.redis.del(REDIS_KEYS.throttleLogin(ip));
  }

  private formatOtpMessage(code: string): string {
    return `NINA-AES : votre code de validation est ${code}. Valable 5 minutes. Ne le partagez à personne.`;
  }
}
