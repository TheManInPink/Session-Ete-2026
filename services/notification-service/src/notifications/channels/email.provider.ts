/**
 * @file        email.provider.ts
 * @description Fournisseur email via SMTP (nodemailer). En développement, le
 *              transport pointe vers **Maildev** (localhost:1025) qui capture
 *              tous les emails — aucun envoi réel. En production, l'hôte SMTP
 *              institutionnel + le mot de passe (injecté par Vault Agent) sont
 *              lus depuis l'environnement.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/channels
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.schema.js';
import {
  NotificationChannel,
  NotificationStatus,
  type ChannelProvider,
  type ChannelSendResult,
  type RenderedMessage,
} from './channel.types.js';

@Injectable()
export class SmtpEmailProvider implements ChannelProvider {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly from: string;
  private readonly enabled: boolean;
  private readonly transporter: Transporter | null;

  constructor(cfg: ConfigService<Env, true>) {
    this.from = cfg.get('SMTP_FROM', { infer: true });
    this.enabled = cfg.get('SMTP_ENABLED', { infer: true });

    const user = cfg.get('SMTP_USER', { infer: true });
    const pass = cfg.get('SMTP_PASSWORD', { infer: true });

    // Transport instancié paresseusement seulement si l'email est actif. En
    // dev/Maildev il n'y a pas d'auth (user/pass vides) → pas de bloc `auth`.
    this.transporter = this.enabled
      ? createTransport({
          host: cfg.get('SMTP_HOST', { infer: true }),
          port: cfg.get('SMTP_PORT', { infer: true }),
          secure: cfg.get('SMTP_SECURE', { infer: true }),
          ...(user ? { auth: { user, pass } } : {}),
        })
      : null;
  }

  /**
   * Envoie un email.
   *
   * @param message Message rendu (recipient = adresse, subject + body).
   * @returns Statut normalisé — ne lève jamais (erreur SMTP ⇒ FAILED).
   */
  async send(message: RenderedMessage): Promise<ChannelSendResult> {
    if (!this.transporter) {
      this.logger.debug(`[Email désactivé] → ${message.recipient} : "${message.subject ?? ''}"`);
      return { status: NotificationStatus.SENT, providerId: `disabled-${Date.now()}` };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.recipient,
        subject: message.subject ?? 'NINA-AES',
        text: message.body,
      });
      // Selon le transport (Maildev, etc.) `messageId` peut être vide : on
      // retombe sur `response` pour conserver une trace côté historique.
      return { status: NotificationStatus.SENT, providerId: info.messageId || info.response };
    } catch (err) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: `Erreur SMTP : ${(err as Error).message}`,
      };
    }
  }
}
