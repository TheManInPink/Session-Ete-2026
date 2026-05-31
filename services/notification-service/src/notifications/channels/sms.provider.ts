/**
 * @file        sms.provider.ts
 * @description Fournisseur SMS via **Africa's Talking** (Mali, Burkina, Niger).
 *
 *              Client REST minimal basé sur `fetch` (pas de SDK : aligné sur
 *              le style de `@nina-aes/vault-client`, plus facile à mocker, et
 *              conforme au principe de souveraineté — dépendance minimale). La
 *              surface (`send`) reflète celle du SDK officiel et reste
 *              substituable.
 *
 *              Le bac-à-sable (sandbox) est détecté automatiquement quand
 *              `AT_USERNAME === 'sandbox'` ; on peut forcer une URL via
 *              `AT_BASE_URL`. Le coupe-circuit `AT_SMS_ENABLED=false` évite
 *              tout appel réseau (CI / tests).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/channels
 */
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

/** Endpoints officiels Africa's Talking. */
const AT_LIVE_URL = 'https://api.africastalking.com/version1/messaging';
const AT_SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging';

/** Forme (partielle) de la réponse JSON de l'API messaging. */
interface AtResponse {
  SMSMessageData?: {
    Message?: string;
    Recipients?: Array<{
      statusCode?: number;
      number?: string;
      status?: string;
      cost?: string;
      messageId?: string;
    }>;
  };
}

@Injectable()
export class AfricasTalkingSmsProvider implements ChannelProvider {
  readonly channel = NotificationChannel.SMS;
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly sandbox: boolean;

  constructor(cfg: ConfigService<Env, true>) {
    this.apiKey = cfg.get('AT_API_KEY', { infer: true });
    this.username = cfg.get('AT_USERNAME', { infer: true });
    this.senderId = cfg.get('AT_SMS_SENDER_ID', { infer: true });
    this.enabled = cfg.get('AT_SMS_ENABLED', { infer: true });
    this.sandbox = this.username === 'sandbox';
    this.baseUrl =
      cfg.get('AT_BASE_URL', { infer: true }) ?? (this.sandbox ? AT_SANDBOX_URL : AT_LIVE_URL);
  }

  /**
   * Envoie un SMS via Africa's Talking.
   *
   * @param message Message rendu (recipient = numéro E.164, body = texte).
   * @returns Statut normalisé — ne lève jamais (erreur réseau ⇒ FAILED).
   */
  async send(message: RenderedMessage): Promise<ChannelSendResult> {
    // Coupe-circuit : en CI/tests on ne contacte pas le réseau.
    if (!this.enabled) {
      this.logger.debug(`[SMS désactivé] → ${message.recipient} : "${message.body}"`);
      return { status: NotificationStatus.SENT, providerId: `disabled-${Date.now()}` };
    }

    const form = new URLSearchParams({
      username: this.username,
      to: message.recipient,
      message: message.body,
    });
    // Le sender ID alphanumérique est ignoré en sandbox ; on ne l'envoie qu'en live.
    if (!this.sandbox && this.senderId) form.set('from', this.senderId);

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          apiKey: this.apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      const json = (await res.json().catch(() => ({}))) as AtResponse;
      const recipient = json.SMSMessageData?.Recipients?.[0];

      if (!res.ok || !recipient) {
        const reason = `AT HTTP ${res.status} — ${json.SMSMessageData?.Message ?? 'réponse vide'}`;
        return { status: NotificationStatus.FAILED, failureReason: reason };
      }

      // AT renvoie `status: "Success"` (+ messageId) quand le SMS est accepté.
      if (recipient.status === 'Success' && recipient.messageId) {
        return { status: NotificationStatus.SENT, providerId: recipient.messageId };
      }
      return {
        status: NotificationStatus.FAILED,
        failureReason: `AT statut "${recipient.status ?? 'inconnu'}" (code ${recipient.statusCode ?? '?'})`,
      };
    } catch (err) {
      return {
        status: NotificationStatus.FAILED,
        failureReason: `Erreur réseau AT : ${(err as Error).message}`,
      };
    }
  }

  /**
   * Mappe un statut de DLR (Delivery Report) Africa's Talking vers le cycle de
   * vie interne. Utilisé par le webhook `/notifications/atalking/callback`.
   *
   * @param status Champ `status` du DLR (Success, Sent, Buffered, Rejected…).
   * @returns Statut interne, ou `null` si le statut est intermédiaire/ignoré.
   */
  static mapDlrStatus(status: string): NotificationStatus | null {
    switch (status) {
      case 'Success':
      case 'Delivered':
        return NotificationStatus.DELIVERED;
      case 'Sent':
      case 'Submitted':
      case 'Buffered':
        return NotificationStatus.SENT;
      case 'Rejected':
      case 'Failed':
      case 'Expired':
      case 'DeliveryFailure':
        return NotificationStatus.FAILED;
      default:
        return null;
    }
  }
}
