/**
 * @file        push.provider.ts
 * @description Fournisseur push via **FCM HTTP v1** (Android + iOS — Firebase
 *              proxifie APNS, donc un seul chemin couvre les deux plateformes).
 *
 *              Implémentation SANS dépendance lourde (`firebase-admin`) : le
 *              jeton d'accès OAuth2 est obtenu via le flux « service account
 *              JWT bearer » signé en RS256 avec `node:crypto`, puis mis en
 *              cache jusqu'à expiration. Conforme au principe de souveraineté
 *              (surface minimale, auditable).
 *
 *              ⚠️  Mode développement : `FCM_ENABLED=false` (défaut). Le
 *              provider journalise la notification et renvoie un succès simulé.
 *              L'app mobile (apps/mobile/) et les credentials Firebase n'étant
 *              pas encore disponibles, le chemin réseau réel reste désactivé
 *              tant que `FCM_ENABLED=true` + `FCM_SERVICE_ACCOUNT` ne sont pas
 *              fournis (injectés par Vault Agent en prod).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/channels
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import {
  NotificationChannel,
  NotificationStatus,
  type ChannelProvider,
  type ChannelSendResult,
  type RenderedMessage,
} from './channel.types.js';

/** Compte de service Firebase (sous-ensemble utilisé). */
interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

@Injectable()
export class FcmPushProvider implements ChannelProvider {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(FcmPushProvider.name);
  private readonly enabled: boolean;
  private readonly sa: ServiceAccount | null;
  private readonly projectId: string;

  /** Cache du jeton d'accès OAuth2 (réutilisé jusqu'à ~60 s avant expiration). */
  private token: { value: string; expiresAt: number } | null = null;

  constructor(cfg: ConfigService<Env, true>) {
    this.enabled = cfg.get('FCM_ENABLED', { infer: true });
    this.sa = this.enabled
      ? this.loadServiceAccount(cfg.get('FCM_SERVICE_ACCOUNT', { infer: true }))
      : null;
    this.projectId = cfg.get('FCM_PROJECT_ID', { infer: true }) || this.sa?.project_id || '';
  }

  /**
   * Envoie une notification push à un appareil.
   *
   * @param message Message rendu (recipient = jeton d'appareil, subject =
   *                titre, body = corps, data = payload structuré).
   * @returns Statut normalisé — ne lève jamais (erreur ⇒ FAILED).
   */
  async send(message: RenderedMessage): Promise<ChannelSendResult> {
    // Mode dev / non configuré : on simule sans contacter Firebase.
    if (!this.enabled || !this.sa || !this.projectId) {
      this.logger.debug(
        `[Push simulé] → ${message.recipient} : "${message.subject ?? message.body}"`,
      );
      return { status: NotificationStatus.SENT, providerId: `simulated-${Date.now()}` };
    }

    try {
      const accessToken = await this.getAccessToken(this.sa);
      const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.recipient,
            notification: { title: message.subject ?? 'NINA-AES', body: message.body },
            ...(message.data ? { data: message.data } : {}),
          },
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        name?: string;
        error?: { message?: string };
      };
      if (!res.ok || !json.name) {
        return {
          status: NotificationStatus.FAILED,
          failureReason: `FCM HTTP ${res.status} — ${json.error?.message ?? 'réponse vide'}`,
        };
      }
      return { status: NotificationStatus.SENT, providerId: json.name };
    } catch (err) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: `Erreur FCM : ${(err as Error).message}`,
      };
    }
  }

  /**
   * Charge le compte de service depuis une chaîne JSON ou un chemin de fichier.
   *
   * @param raw JSON inline (commence par `{`) ou chemin vers le fichier SA.
   * @returns Le compte de service, ou `null` si illisible (le provider
   *          retombe alors en mode simulé).
   */
  private loadServiceAccount(raw: string): ServiceAccount | null {
    if (!raw) return null;
    try {
      const json = raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8');
      const sa = JSON.parse(json) as ServiceAccount;
      // `as` ne valide pas à l'exécution : on vérifie les champs obligatoires
      // avant de manipuler `private_key` (sinon TypeError trompeur).
      if (!sa.client_email || !sa.private_key) {
        this.logger.warn(
          'Compte de service FCM incomplet (client_email/private_key) — mode simulé.',
        );
        return null;
      }
      // Les clés issues d'un .env ont souvent leurs sauts de ligne échappés.
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
      return sa;
    } catch (err) {
      this.logger.warn(
        `Compte de service FCM illisible : ${(err as Error).message} — mode simulé.`,
      );
      return null;
    }
  }

  /**
   * Obtient (et met en cache) un jeton d'accès OAuth2 via le flux JWT bearer.
   *
   * @param sa Compte de service Firebase.
   * @returns Jeton d'accès `Bearer`.
   */
  private async getAccessToken(sa: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiresAt > now + 60) return this.token.value;

    // 1) Construit et signe le JWT d'assertion (RS256).
    const header = this.b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = this.b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: FCM_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(sa.private_key).toString('base64url');
    const assertion = `${header}.${claims}.${signature}`;

    // 2) Échange l'assertion contre un access_token.
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      throw new Error(`OAuth2 Google ${res.status} : ${json.error_description ?? 'échec'}`);
    }
    this.token = { value: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
    return this.token.value;
  }

  /** Encode une chaîne UTF-8 en base64url (sans padding). */
  private b64url(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64url');
  }
}
