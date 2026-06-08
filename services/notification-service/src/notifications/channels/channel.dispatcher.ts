/**
 * @file        channel.dispatcher.ts
 * @description Aiguille un message rendu vers le bon fournisseur selon son
 *              canal. USSD est traité comme un SMS court (même transport).
 *              VOICE n'est pas encore implémenté (Bloc ultérieur).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/channels
 */
import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  type ChannelProvider,
  type ChannelSendResult,
  type RenderedMessage,
} from './channel.types.js';
import { AfricasTalkingSmsProvider } from './sms.provider.js';
import { SmtpEmailProvider } from './email.provider.js';
import { FcmPushProvider } from './push.provider.js';

@Injectable()
export class ChannelDispatcher {
  private readonly providers: Map<NotificationChannel, ChannelProvider>;

  constructor(sms: AfricasTalkingSmsProvider, email: SmtpEmailProvider, push: FcmPushProvider) {
    this.providers = new Map<NotificationChannel, ChannelProvider>([
      [NotificationChannel.SMS, sms],
      [NotificationChannel.USSD, sms], // confirmation USSD = SMS court
      [NotificationChannel.EMAIL, email],
      [NotificationChannel.PUSH, push],
    ]);
  }

  /** Indique si un canal est desservi par un fournisseur. */
  supports(channel: NotificationChannel): boolean {
    return this.providers.has(channel);
  }

  /**
   * Expédie le message via le fournisseur du canal demandé.
   *
   * @param channel Canal cible.
   * @param message Message rendu.
   * @returns Statut normalisé (FAILED si le canal n'est pas supporté).
   */
  dispatch(channel: NotificationChannel, message: RenderedMessage): Promise<ChannelSendResult> {
    const provider = this.providers.get(channel);
    if (!provider) {
      return Promise.resolve({
        status: NotificationStatus.FAILED,
        failureReason: `Canal ${channel} non supporté par notification-service`,
        permanent: true,
      });
    }
    return provider.send(message);
  }
}
