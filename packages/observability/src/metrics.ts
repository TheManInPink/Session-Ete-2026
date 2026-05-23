/**
 * @file        metrics.ts
 * @description Métriques métier custom NINA-AES — counters + histograms
 *              utilisables depuis n'importe quel service via injection
 *              `@Inject(BusinessMetrics)`.
 *
 *              Convention de nommage Prometheus :
 *                <domain>_<subject>_<unit>
 *              ex. : `identity_citizens_validated_total`,
 *                    `ai_inference_duration_seconds`.
 *
 *              Toutes les métriques sont enregistrées sur le registre
 *              GLOBAL (`prom-client` default registry) → automatiquement
 *              exposées sur `/metrics`.
 */

import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * Service injectable exposant des métriques métier prédéfinies.
 *
 * NB : pour ajouter une métrique custom à un service précis, créer
 * un Provider local qui dépend de `@willsoto/nestjs-prometheus` plutôt
 * que d'étendre cette classe (séparation des préoccupations).
 */
@Injectable()
export class BusinessMetrics {
  // ─── identity-service ──────────────────────────────────────────
  /** Total validations NINA (par résultat : success / failure). */
  readonly ninaValidated = new Counter({
    name: 'identity_citizens_validated_total',
    help: 'Nombre total de validations NINA effectuées',
    labelNames: ['result', 'region'] as const,
  });

  /** Latence des recherches floues NINA (par index Elasticsearch). */
  readonly ninaSearchDuration = new Histogram({
    name: 'identity_nina_search_duration_seconds',
    help: 'Latence des recherches NINA en secondes',
    labelNames: ['index'] as const,
    buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
  });

  // ─── ai-service ────────────────────────────────────────────────
  /** Total erreurs détectées par classe (translittération, typo, ...). */
  readonly aiErrorsDetected = new Counter({
    name: 'ai_nina_errors_detected_total',
    help: 'Erreurs détectées par le pipeline IA, par classe',
    labelNames: ['error_class'] as const,
  });

  /** Latence inférence IA (pipeline 5 étapes). */
  readonly aiInferenceDuration = new Histogram({
    name: 'ai_inference_duration_seconds',
    help: "Latence d'une inférence IA complète",
    buckets: [0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
  });

  /** Records traités (throughput batch). */
  readonly aiRecordsProcessed = new Counter({
    name: 'ai_records_processed_total',
    help: 'Records NINA traités par le pipeline IA',
  });

  /** Score moyen de confiance (gauge — pas un total). */
  readonly aiConfidenceScore = new Gauge({
    name: 'ai_confidence_score',
    help: 'Score de confiance moyen IA (0-100) — fenêtre glissante 5min',
  });

  // ─── audit-service / SIGAC ────────────────────────────────────
  /** Total entrées audit (par action). */
  readonly auditEntriesTotal = new Counter({
    name: 'audit_entries_total',
    help: "Nombre total d'entrées dans l'audit log",
    labelNames: ['action', 'severity'] as const,
  });

  /** Rupture de chaîne Merkle (compteur — doit rester à 0). */
  readonly merkleChainBreak = new Counter({
    name: 'audit_merkle_chain_break_total',
    help: 'Nombre de ruptures de chaîne Merkle détectées',
  });

  /** Anomalies agents détectées par Isolation Forest (par seuil). */
  readonly sigacAgentAnomaly = new Gauge({
    name: 'sigac_agent_anomaly_score',
    help: "Score d'anomalie d'un agent (0-100, > 75 = flag)",
    labelNames: ['user_id', 'region'] as const,
  });

  /** Score d'intégrité agrégé par région. */
  readonly sigacIntegrityScore = new Gauge({
    name: 'sigac_integrity_score',
    help: "Score d'intégrité agrégé (0-100)",
    labelNames: ['region'] as const,
  });

  /** Signalements lanceurs d'alerte (par classification BERT). */
  readonly sigacReports = new Counter({
    name: 'sigac_whistleblower_reports_total',
    help: "Signalements lanceurs d'alerte reçus",
    labelNames: ['classification', 'severity'] as const,
  });

  /** Signalements en attente de traitement procureur. */
  readonly sigacPendingReports = new Gauge({
    name: 'sigac_pending_reports',
    help: 'Signalements en attente de traitement',
    labelNames: ['severity'] as const,
  });

  // ─── Workflow citoyen (corrections, RDV, vulnérabilité) ───────
  /** Demandes de correction NINA (par status). */
  readonly correctionRequests = new Counter({
    name: 'correction_requests_total',
    help: 'Total demandes de correction NINA',
    labelNames: ['status', 'reason_class'] as const,
  });

  /** Rendez-vous CTDEC créés (par cercle). */
  readonly appointmentsCreated = new Counter({
    name: 'appointments_created_total',
    help: 'Total rendez-vous CTDEC créés',
    labelNames: ['cercle', 'type'] as const,
  });

  /** Profils de vulnérabilité actifs (gauge — current state). */
  readonly vulnerabilityProfiles = new Gauge({
    name: 'vulnerability_profiles_total',
    help: 'Profils de vulnérabilité actifs',
    labelNames: ['category'] as const,
  });

  // ─── USSD ──────────────────────────────────────────────────────
  /** Sessions USSD (par langue). */
  readonly ussdSessions = new Counter({
    name: 'ussd_sessions_total',
    help: 'Sessions USSD démarrées',
    labelNames: ['language', 'menu'] as const,
  });

  // ─── BCID-AES Interop (Bloc B) ────────────────────────────────
  /** Vérifications cross-border (par pays demandeur). */
  readonly aesVerifyNina = new Counter({
    name: 'aes_verify_nina_total',
    help: 'Vérifications NINA cross-border (BCID-AES)',
    labelNames: ['requester_country', 'result'] as const,
  });

  // ─── Vault rotation ───────────────────────────────────────────
  /** Échecs de rotation des secrets Vault (compteur — doit rester à 0). */
  readonly vaultRotationFailed = new Counter({
    name: 'vault_rotation_failed_total',
    help: 'Échecs de rotation des secrets Vault',
    labelNames: ['key_name'] as const,
  });
}
