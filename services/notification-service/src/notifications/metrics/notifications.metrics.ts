/**
 * @file        notifications.metrics.ts
 * @description Métriques en mémoire du service : envois/heure, taux de succès
 *              par canal, latence moyenne. Légères et sans dépendance (un
 *              export Prometheus pourra être branché via `@nina-aes/observability`
 *              dans la doc 17 Monitoring).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      notification-service/metrics
 */
import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '../channels/channel.types.js';

/** Compteurs par canal. */
interface ChannelCounters {
  attempted: number;
  sent: number;
  failed: number;
  delivered: number;
  latencySumMs: number;
  latencySamples: number;
}

/** Fenêtre glissante : 1 heure. */
const HOUR_MS = 3_600_000;

@Injectable()
export class NotificationsMetrics {
  private readonly startedAt = Date.now();
  private readonly counters = new Map<NotificationChannel, ChannelCounters>();
  /** Horodatages (ms) des envois acceptés sur la dernière heure. */
  private sendTimestamps: number[] = [];

  private bucket(channel: NotificationChannel): ChannelCounters {
    let c = this.counters.get(channel);
    if (!c) {
      c = { attempted: 0, sent: 0, failed: 0, delivered: 0, latencySumMs: 0, latencySamples: 0 };
      this.counters.set(channel, c);
    }
    return c;
  }

  /** Enregistre une tentative d'envoi (avant appel fournisseur). */
  recordAttempt(channel: NotificationChannel): void {
    this.bucket(channel).attempted += 1;
  }

  /**
   * Enregistre le résultat d'un envoi.
   *
   * @param channel   Canal.
   * @param status    SENT ou FAILED.
   * @param latencyMs Durée de l'appel fournisseur.
   */
  recordResult(
    channel: NotificationChannel,
    status: NotificationStatus.SENT | NotificationStatus.FAILED,
    latencyMs: number,
  ): void {
    const c = this.bucket(channel);
    c.latencySumMs += latencyMs;
    c.latencySamples += 1;
    if (status === NotificationStatus.SENT) {
      c.sent += 1;
      const now = Date.now();
      this.sendTimestamps.push(now);
      this.pruneWindow(now);
    } else {
      c.failed += 1;
    }
  }

  /** Enregistre un accusé de livraison (DLR). */
  recordDelivered(channel: NotificationChannel): void {
    this.bucket(channel).delivered += 1;
  }

  /** Purge les horodatages plus vieux qu'une heure. */
  private pruneWindow(now: number): void {
    const cutoff = now - HOUR_MS;
    if (this.sendTimestamps.length && this.sendTimestamps[0]! < cutoff) {
      this.sendTimestamps = this.sendTimestamps.filter((t) => t >= cutoff);
    }
  }

  /** Instantané des métriques (consommé par GET /notifications/metrics). */
  snapshot(): Record<string, unknown> {
    const now = Date.now();
    this.pruneWindow(now);
    const perChannel: Record<string, unknown> = {};
    let totalSent = 0;
    let totalFailed = 0;

    for (const [channel, c] of this.counters) {
      const attempts = c.sent + c.failed;
      totalSent += c.sent;
      totalFailed += c.failed;
      perChannel[channel] = {
        attempted: c.attempted,
        sent: c.sent,
        failed: c.failed,
        delivered: c.delivered,
        successRate: attempts > 0 ? Number((c.sent / attempts).toFixed(4)) : null,
        avgLatencyMs: c.latencySamples > 0 ? Math.round(c.latencySumMs / c.latencySamples) : null,
      };
    }

    const totalAttempts = totalSent + totalFailed;
    return {
      uptimeSec: Math.round((now - this.startedAt) / 1000),
      sentLastHour: this.sendTimestamps.length,
      totals: {
        sent: totalSent,
        failed: totalFailed,
        successRate: totalAttempts > 0 ? Number((totalSent / totalAttempts).toFixed(4)) : null,
      },
      perChannel,
    };
  }
}
