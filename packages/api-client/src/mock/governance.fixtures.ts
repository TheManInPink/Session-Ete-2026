/**
 * @file        governance.fixtures.ts
 * @description Fixtures déterministes du domaine gouvernance (GOV-01/GOV-02).
 *
 *              Inbox SGOGT : 8 messages répartis sur 3 fils, adressés au
 *              persona de session mock governance (`MOCK_GOVERNANCE_USER_ID`),
 *              priorités variées, dont un CRITICAL proche de son échéance
 *              d'escalade. Les signatures sont des JWS compacts FACTICES mais
 *              plausibles (`header.payload.signature` base64url) — en vrai la
 *              signature est produite côté serveur (Vault Transit, ADR-026/034).
 *
 *              Directives : 7 tâches couvrant les 5 colonnes Kanban.
 *
 * @module      @nina-aes/api-client
 */

import {
  DirectiveViewSchema,
  MessageViewSchema,
  type DirectiveView,
  type MessageView,
  type SgogtPriority,
} from '../governance/governance.schema';
import { hexFrom, isoHoursFrom, uuidFrom } from './deterministic';
import { MOCK_GOVERNANCE_DIRECTORY, MOCK_GOVERNANCE_USER_ID } from './personas';

/** En-tête JWS `{"alg":"RS256"}` encodé base64url (vraisemblance du format). */
const JWS_HEADER_RS256 = 'eyJhbGciOiJSUzI1NiJ9';

/**
 * Fabrique un JWS compact **factice** déterministe (`xxx.yyy.zzz`). Les hex
 * générés sont un sous-ensemble de base64url → format RFC 7515 respecté.
 */
export function fakeJws(seedText: string): string {
  return `${JWS_HEADER_RS256}.${hexFrom(`${seedText}-payload`, 48)}.${hexFrom(`${seedText}-sig`, 86)}`;
}

/** Fils de discussion des fixtures (exposés pour les e2e governance). */
export const MOCK_SGOGT_THREAD_IDS = {
  rapportTrimestriel: uuidFrom('sgogt-thread-rapport-trimestriel'),
  auditSikasso: uuidFrom('sgogt-thread-audit-sikasso'),
  incidentRavec: uuidFrom('sgogt-thread-incident-ravec'),
} as const;

/** Id des interlocuteurs (annuaire mock). */
const PRIMATURE_ID = MOCK_GOVERNANCE_DIRECTORY[1]!.id;
const DNEC_ID = MOCK_GOVERNANCE_DIRECTORY[2]!.id;
const SECURITE_ID = MOCK_GOVERNANCE_DIRECTORY[3]!.id;

/** Délai d'escalade calqué sur le backend : CRITICAL = 4 h, sinon 24 h. */
function ttlFor(priority: SgogtPriority, createdAt: string): string {
  return isoHoursFrom(createdAt, priority === 'CRITICAL' ? 4 : 24);
}

interface MessageSeed {
  slug: string;
  threadId: string;
  senderId: string;
  subject: string;
  body: string;
  priority: SgogtPriority;
  status: MessageView['status'];
  createdAt: string;
  readAt?: string;
  respondedAt?: string;
}

/** Matérialise une graine en `MessageView` validé (fail-closed). */
function buildMessage(seed: MessageSeed): MessageView {
  return MessageViewSchema.parse({
    id: uuidFrom(`sgogt-msg-${seed.slug}`),
    threadId: seed.threadId,
    senderId: seed.senderId,
    recipientId: MOCK_GOVERNANCE_USER_ID,
    subject: seed.subject,
    body: seed.body,
    priority: seed.priority,
    status: seed.status,
    ttlEscalateAt: ttlFor(seed.priority, seed.createdAt),
    escalatedToId: null,
    readAt: seed.readAt ?? null,
    respondedAt: seed.respondedAt ?? null,
    jwsSignature: fakeJws(`sgogt-msg-${seed.slug}`),
    chainHash: hexFrom(`sgogt-chain-${seed.slug}`, 64),
    createdAt: seed.createdAt,
  });
}

/** Inbox initiale : 8 messages, 3 fils, priorités variées. */
export function buildSgogtInbox(): MessageView[] {
  return [
    // ── Fil « rapport trimestriel RAVEC » (NORMAL) ──────────────────────────
    buildMessage({
      slug: 'rapport-1',
      threadId: MOCK_SGOGT_THREAD_IDS.rapportTrimestriel,
      senderId: PRIMATURE_ID,
      subject: 'Préparation du rapport trimestriel RAVEC (T2 2026)',
      body: 'Monsieur le Ministre, merci de transmettre les indicateurs consolidés d’enrôlement (T2) avant le 5 juin : volumes par région, taux de rejet et délais moyens de délivrance.',
      priority: 'NORMAL',
      status: 'RESPONDED',
      createdAt: '2026-05-28T10:00:00.000Z',
      readAt: '2026-05-28T11:05:00.000Z',
      respondedAt: '2026-05-28T15:20:00.000Z',
    }),
    buildMessage({
      slug: 'rapport-2',
      threadId: MOCK_SGOGT_THREAD_IDS.rapportTrimestriel,
      senderId: PRIMATURE_ID,
      subject: 'RE: Préparation du rapport trimestriel RAVEC (T2 2026)',
      body: 'Complément : la Primature souhaite une annexe sur la couverture des antennes mobiles dans les cercles de Nioro et de Diéma.',
      priority: 'NORMAL',
      status: 'READ',
      createdAt: '2026-05-30T09:00:00.000Z',
      readAt: '2026-05-30T10:12:00.000Z',
    }),
    buildMessage({
      slug: 'rapport-3',
      threadId: MOCK_SGOGT_THREAD_IDS.rapportTrimestriel,
      senderId: PRIMATURE_ID,
      subject: 'RE: Préparation du rapport trimestriel RAVEC (T2 2026)',
      body: 'Relance : le comité interministériel est avancé au 6 juin, merci de confirmer la date de remise du rapport.',
      priority: 'NORMAL',
      status: 'SENT',
      createdAt: '2026-05-31T14:00:00.000Z',
    }),
    // ── Fil « audit CTDEC Sikasso » (HIGH) ──────────────────────────────────
    buildMessage({
      slug: 'audit-1',
      threadId: MOCK_SGOGT_THREAD_IDS.auditSikasso,
      senderId: DNEC_ID,
      subject: 'Audit des centres CTDEC — région de Sikasso',
      body: 'Suite aux écarts constatés sur les registres de mai, une mission d’audit est proposée du 9 au 13 juin sur les centres de Sikasso, Koutiala et Bougouni. Validation requise.',
      priority: 'HIGH',
      status: 'RESPONDED',
      createdAt: '2026-05-29T08:00:00.000Z',
      readAt: '2026-05-29T08:40:00.000Z',
      respondedAt: '2026-05-29T11:00:00.000Z',
    }),
    buildMessage({
      slug: 'audit-2',
      threadId: MOCK_SGOGT_THREAD_IDS.auditSikasso,
      senderId: DNEC_ID,
      subject: 'RE: Audit des centres CTDEC — région de Sikasso',
      body: 'L’équipe d’audit est constituée (4 inspecteurs). Ordre de mission en attente de votre signature électronique.',
      priority: 'HIGH',
      status: 'READ',
      createdAt: '2026-05-31T08:00:00.000Z',
      readAt: '2026-05-31T09:30:00.000Z',
    }),
    buildMessage({
      slug: 'audit-3',
      threadId: MOCK_SGOGT_THREAD_IDS.auditSikasso,
      senderId: DNEC_ID,
      subject: 'RE: Audit des centres CTDEC — région de Sikasso',
      body: 'Le centre de Koutiala signale une indisponibilité réseau prolongée : faut-il maintenir l’étape du 11 juin ?',
      priority: 'HIGH',
      status: 'SENT',
      createdAt: '2026-06-01T07:00:00.000Z',
    }),
    // ── Fil « incident sécurité RAVEC » (dont un CRITICAL proche du TTL) ────
    buildMessage({
      slug: 'incident-1',
      threadId: MOCK_SGOGT_THREAD_IDS.incidentRavec,
      senderId: SECURITE_ID,
      subject: 'Signalement — tentative d’accès anormale au fichier RAVEC',
      body: 'Des connexions répétées hors plage horaire ont été détectées sur le poste de saisie n°12 (Bamako). Investigation préliminaire en cours.',
      priority: 'HIGH',
      status: 'READ',
      createdAt: '2026-05-31T16:00:00.000Z',
      readAt: '2026-05-31T17:45:00.000Z',
    }),
    // CRITICAL émis à 06:30, TTL 4 h → escalade à 10:30 (1 h 30 après FIXED_NOW).
    buildMessage({
      slug: 'incident-2',
      threadId: MOCK_SGOGT_THREAD_IDS.incidentRavec,
      senderId: SECURITE_ID,
      subject: 'URGENT — suspicion d’exfiltration de données d’enrôlement',
      body: 'Confirmation d’un transfert sortant non autorisé (2,3 Go) depuis le site de Bamako vers une adresse externe. Décision immédiate requise : isolement du segment réseau et saisine du procureur.',
      priority: 'CRITICAL',
      status: 'SENT',
      createdAt: '2026-06-01T06:30:00.000Z',
    }),
  ];
}

interface DirectiveSeed {
  slug: string;
  title: string;
  description: string;
  status: DirectiveView['status'];
  priority: SgogtPriority;
  createdById: string;
  assigneeId?: string;
  deadline?: string;
  escalationLevel?: number;
  rejectionReason?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Matérialise une graine en `DirectiveView` validé (fail-closed). */
function buildDirective(seed: DirectiveSeed): DirectiveView {
  return DirectiveViewSchema.parse({
    id: uuidFrom(`directive-${seed.slug}`),
    title: seed.title,
    description: seed.description,
    status: seed.status,
    priority: seed.priority,
    createdById: seed.createdById,
    assigneeId: seed.assigneeId ?? null,
    deadline: seed.deadline ?? null,
    escalationLevel: seed.escalationLevel ?? 0,
    rejectionReason: seed.rejectionReason ?? null,
    completedAt: seed.completedAt ?? null,
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt ?? seed.createdAt,
  });
}

/** Kanban initial : 7 directives couvrant les 5 statuts. */
export function buildDirectiveStore(): DirectiveView[] {
  return [
    buildDirective({
      slug: 'antennes-kayes',
      title: 'Déploiement des antennes RAVEC mobiles — région de Kayes',
      description:
        'Planifier et déployer 6 antennes mobiles d’enrôlement dans les cercles de Nioro, Diéma et Yélimané avant la saison des pluies.',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      createdById: PRIMATURE_ID,
      assigneeId: MOCK_GOVERNANCE_USER_ID,
      deadline: '2026-06-15T00:00:00.000Z',
      createdAt: '2026-05-20T09:00:00.000Z',
      updatedAt: '2026-05-26T14:00:00.000Z',
    }),
    buildDirective({
      slug: 'campagne-etat-civil',
      title: 'Campagne nationale de fiabilisation de l’état civil',
      description:
        'Lancer la campagne de sensibilisation et de correction des actes d’état civil dans les 10 régions (guichets dédiés + canal USSD).',
      status: 'SENT',
      priority: 'NORMAL',
      createdById: MOCK_GOVERNANCE_USER_ID,
      assigneeId: DNEC_ID,
      deadline: '2026-07-01T00:00:00.000Z',
      createdAt: '2026-05-25T10:00:00.000Z',
    }),
    buildDirective({
      slug: 'audit-ctdec-t2',
      title: 'Audit trimestriel des centres CTDEC (T2 2026)',
      description:
        'Conduire l’audit de conformité des 14 centres CTDEC : registres, délais de délivrance, traçabilité des corrections.',
      status: 'IN_PROGRESS',
      priority: 'NORMAL',
      createdById: DNEC_ID,
      assigneeId: MOCK_GOVERNANCE_USER_ID,
      escalationLevel: 1,
      createdAt: '2026-05-18T08:00:00.000Z',
      updatedAt: '2026-05-29T16:00:00.000Z',
    }),
    buildDirective({
      slug: 'rapport-electoral-2027',
      title: 'Préparation du rapport électoral 2027',
      description:
        'Constituer le dossier technique pour la DGE : couverture du registre, projection des nouveaux majeurs, plan d’export pseudonymisé.',
      status: 'DRAFT',
      priority: 'CRITICAL',
      createdById: MOCK_GOVERNANCE_USER_ID,
      createdAt: '2026-05-30T11:00:00.000Z',
    }),
    buildDirective({
      slug: 'pseudonymisation-electorale',
      title: 'Pseudonymisation du registre électoral (export DGE)',
      description:
        'Mettre en production le pipeline d’export delta pseudonymisé (HMAC Vault) vers la Délégation Générale aux Élections.',
      status: 'COMPLETED',
      priority: 'HIGH',
      createdById: PRIMATURE_ID,
      assigneeId: MOCK_GOVERNANCE_USER_ID,
      completedAt: '2026-05-28T17:30:00.000Z',
      createdAt: '2026-05-05T09:00:00.000Z',
      updatedAt: '2026-05-28T17:30:00.000Z',
    }),
    buildDirective({
      slug: 'formation-agents-saisie',
      title: 'Plan de formation des agents de saisie RAVEC',
      description:
        'Élaborer le programme de formation continue (qualité de saisie, lutte anti-fraude, protection des données) pour 240 agents.',
      status: 'DRAFT',
      priority: 'NORMAL',
      createdById: MOCK_GOVERNANCE_USER_ID,
      createdAt: '2026-05-31T15:00:00.000Z',
    }),
    buildDirective({
      slug: 'doublons-mopti',
      title: 'Enquête sur les doublons NINA — région de Mopti',
      description:
        'Vérifier les 412 suspicions de doublons remontées par le moteur de détection IA sur les cercles de Mopti et Bandiagara.',
      status: 'REJECTED',
      priority: 'HIGH',
      createdById: DNEC_ID,
      rejectionReason:
        'Budget de mission non disponible pour le trimestre en cours — à re-soumettre au T3 avec le plan de financement.',
      createdAt: '2026-05-12T10:00:00.000Z',
      updatedAt: '2026-05-15T09:00:00.000Z',
    }),
  ];
}
