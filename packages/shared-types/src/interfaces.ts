/**
 * @file        interfaces.ts
 * @description Interfaces métier transverses de la plateforme NINA-AES.
 *
 *              Ces 16 contrats sont partagés entre :
 *                - les microservices NestJS (DTOs d'entrée/sortie),
 *                - les apps Next.js (typage des appels API),
 *                - les éventuels clients tiers (interopérabilité AES).
 *
 *              Toutes les dates sont en ISO 8601 (chaînes), tous les IDs
 *              sont des UUID v7 sauf mention contraire.
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      @nina-aes/shared-types
 */

import type {
  AESCountry,
  AlertSeverity,
  AppointmentStatus,
  CorrectionStatus,
  DirectiveStatus,
  Language,
  MaritalStatus,
  PriorityLevel,
  Sex,
  UserRole,
  VulnerabilityCategory,
} from './enums';

// ──────────────────────────────────────────────────────────────────────────────
//  1. Location — hiérarchie géographique sur 10 niveaux
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Localisation hiérarchique normalisée (10 champs).
 *
 * Sert à la fois au lieu de naissance et à la résidence sur la Fiche
 * Descriptive Individuelle (FDI). La granularité descend jusqu'au hameau,
 * pour épouser le découpage administratif réel des États du Sahel.
 */
export interface Location {
  /** Identifiant unique (UUID). */
  id: string;
  /** Code ISO 3166-1 alpha-3 (`MLI`, `BFA`, `NER`). */
  countryCode: string;
  /** Nom complet du pays en français (ex. « Mali »). */
  pays: string;
  /** Région administrative. */
  région: string;
  /** Cercle (subdivision régionale au Mali). */
  cercle: string;
  /** Commune. */
  commune: string;
  /** Quartier ou secteur. */
  quartier: string;
  /** Fraction (subdivision communale propre aux zones nomades). */
  fraction: string;
  /** Village. */
  village: string;
  /** Hameau ou lieu-dit. */
  hameau: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  2. Parent — figurant sur la FDI
// ──────────────────────────────────────────────────────────────────────────────

/** Parent figurant sur la FDI (père / mère / tuteur légal). */
export interface Parent {
  /** Lien de filiation. */
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN';
  /** Prénom(s). */
  firstName: string;
  /** Nom de famille. */
  lastName: string;
  /** NINA si connu (optionnel). */
  nina?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  3. Citizen — citoyen enregistré
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Vue agrégée d'un citoyen, telle qu'exposée par les APIs (sans secrets).
 *
 * `fingerprintHash` est un digest SHA-256 du template biométrique — jamais
 * le template brut (Bloc F).
 */
export interface Citizen {
  /** Identifiant interne (UUID). */
  id: string;
  /** Numéro NINA (15 caractères). */
  nina: string;
  /** Prénom(s) usuel(s). */
  firstName: string;
  /** Nom. */
  lastName: string;
  /** Sexe. */
  sex: Sex;
  /** Date de naissance ISO 8601 (AAAA-MM-JJ). */
  birthDate: string;
  /** Lieu de naissance (hiérarchie 10 niveaux). */
  birthPlace: Location;
  /** Lieu de résidence actuelle. */
  residence: Location;
  /** Statut matrimonial. */
  maritalStatus: MaritalStatus;
  /** Profession (libellé court). */
  profession: string;
  /** Père / mère selon FDI. */
  parents: Parent[];
  /** URL MinIO de la photo (signed URL temporaire). */
  photoUrl?: string;
  /** Empreinte SHA-256 du template biométrique (jamais le template brut). */
  fingerprintHash?: string;
  /** Catégorie de vulnérabilité (file prioritaire, USSD…). */
  vulnerabilityCategory?: VulnerabilityCategory;
  /** Langue préférée pour canaux inclusifs. */
  preferredLanguage?: Language;
  /** Métadonnées d'audit (version fiche, etc.). */
  metadata?: Record<string, string>;
  /** Date de création (ISO 8601). */
  createdAt: string;
  /** Date de dernière mise à jour (ISO 8601). */
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  4. CorrectionRequest — demande de correction NINA
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Demande de correction d'un champ NINA (saisie erronée, homonymie,
 * proposition issue du module IA).
 */
export interface CorrectionRequest {
  id: string;
  /** Identifiant interne du citoyen (UUID). */
  citizenId: string;
  /** NINA concerné (redondant pour requêtes rapides). */
  nina: string;
  /** Champ métier ciblé (ex. `cercle`, `commune`, `lastName`). */
  fieldKey: string;
  /** Valeur actuelle en base. */
  currentValue: string;
  /** Valeur proposée par le citoyen ou l'IA. */
  proposedValue: string;
  /** Score de confiance IA (0–100), si applicable. */
  aiConfidence?: number;
  /** URL MinIO du justificatif scanné (CIN, acte de naissance…). */
  justificationDocUrl?: string;
  /** Identifiant agent ayant statué (UUID utilisateur). */
  reviewedBy?: string;
  status: CorrectionStatus;
  /** Identifiant du demandeur (utilisateur Keycloak / NINA). */
  requestedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  5. Appointment — rendez-vous CTDEC / antenne
// ──────────────────────────────────────────────────────────────────────────────

/** Rendez-vous physique ou téléphonique (CTDEC / antenne RAVEC). */
export interface Appointment {
  id: string;
  /** Identifiant interne du citoyen (UUID). */
  citizenId: string;
  /** NINA du citoyen (redondant). */
  nina: string;
  status: AppointmentStatus;
  /** Priorité opérationnelle. */
  priority: PriorityLevel;
  /** Catégorie vulnérabilité (file prioritaire). */
  vulnerability?: VulnerabilityCategory;
  /** Créneau horaire ISO 8601 (début). */
  startsAt: string;
  /** Créneau horaire ISO 8601 (fin). */
  endsAt: string;
  /** Identifiant du centre / antenne (UUID). */
  centerId: string;
  /** Numéro dans la file d'attente du jour (1, 2, …). */
  queueNumber: number;
  /** Langue préférée pour rappel. */
  language: Language;
  /** Notes internes. */
  notes?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  6. CorruptionAlert — signalement SIGAC
// ──────────────────────────────────────────────────────────────────────────────

/** Cycle de vie d'une alerte SIGAC. */
export type CorruptionAlertStatus = 'OPEN' | 'TRIAGE' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

/** Signalement structuré d'un fait de corruption (SIGAC). */
export interface CorruptionAlert {
  id: string;
  severity: AlertSeverity;
  status: CorruptionAlertStatus;
  /** Titre court pour tableaux de bord. */
  title: string;
  /** Détail factuel (chiffré bout-en-bout en stockage). */
  description: string;
  /** Pays concerné. */
  country: AESCountry;
  /** Agent visé par le signalement (UUID utilisateur). */
  agentUserId?: string;
  /** URLs MinIO des pièces jointes (audio, photo, doc). */
  evidenceUrls: string[];
  /**
   * Jeton anonyme remis au lanceur d'alerte pour suivre l'instruction
   * sans révéler son identité (rotation Vault).
   */
  anonymousReporterToken?: string;
  /** Référence dossier (ex. NINA, contrat). */
  referenceId?: string;
  /** Horodatage de création. */
  createdAt: string;
  /** Identifiant du rapporteur si non anonyme. */
  reportedByUserId?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  7. AgentIntegrityScore — score d'intégrité agent (5 facteurs)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Score d'intégrité d'un agent CTDEC (0–100), agrégé périodiquement par le
 * service anti-corruption avec 5 facteurs explicites.
 */
export interface AgentIntegrityScore {
  /** Identifiant métier de l'agent (UUID utilisateur). */
  agentUserId: string;
  /** Score global 0–100 (combinaison pondérée du `breakdown`). */
  totalScore: number;
  /** Cinq facteurs normalisés à 0–100 (100 = nominal). */
  breakdown: {
    /** Taux d'anomalies détectées (Isolation Forest). */
    anomalyRate: number;
    /** Conformité aux horaires planifiés. */
    scheduleCompliance: number;
    /** Taux de justifications fournies pour les corrections. */
    justificationRate: number;
    /** Note moyenne issue des retours citoyens. */
    citizenFeedback: number;
    /** Écart de volume traité vs. médiane équipe. */
    volumeDeviation: number;
  };
  /** Période d'agrégation. */
  periodStart: string;
  periodEnd: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  8. GovernanceDirective — directive SGOGT
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Directive issue d'une autorité hiérarchique (ministère, gouvernorat).
 * Remplace les appels téléphoniques par une trace écrite signée.
 */
export interface GovernanceDirective {
  id: string;
  /** Émetteur (UUID utilisateur). */
  issuerId: string;
  /** Destinataire principal (UUID utilisateur). */
  assigneeId: string;
  /** Institution émettrice (UUID). */
  institutionId: string;
  /** Titre court. */
  title: string;
  /** Description longue (Markdown autorisé). */
  description: string;
  status: DirectiveStatus;
  /** Priorité opérationnelle. */
  priority: PriorityLevel;
  /** Date butoir d'exécution (ISO 8601). */
  deadline: string;
  /** 0 = niveau local, 1+ = escalade hiérarchique. */
  escalationLevel: number;
  /** Pays concerné. */
  country: AESCountry;
  /** Référence dossier (ex. NINA, contrat). */
  referenceCode?: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  9. GovernanceMessage — message institutionnel signé Ed25519
// ──────────────────────────────────────────────────────────────────────────────

/** Pièce jointe à un message gouvernance. */
export interface GovernanceAttachment {
  /** Nom de fichier original. */
  filename: string;
  /** URL MinIO (signed URL temporaire). */
  url: string;
  /** Type MIME. */
  contentType: string;
  /** Taille en octets. */
  size: number;
  /** Empreinte SHA-256 (vérification d'intégrité). */
  sha256: string;
}

/**
 * Message signé (Ed25519) entre acteurs institutionnels (SGOGT).
 * Remplace les appels téléphoniques non traçables par des échanges
 * écrits, signés et horodatés serveur.
 */
export interface GovernanceMessage {
  id: string;
  /** Sujet du message. */
  subject: string;
  /** Contenu affichable (Markdown autorisé). */
  body: string;
  /** Pièces jointes signées avec le message. */
  attachments: GovernanceAttachment[];
  /** Signature detached Ed25519 (base64url). */
  signatureEd25519: string;
  /** Empreinte de la clé publique utilisée (base64). */
  publicKeyFingerprint: string;
  /** Statut de lecture côté destinataire. */
  readStatus: 'unread' | 'read';
  /** Horodatage serveur (ISO 8601). */
  serverTimestamp: string;
  /** Expéditeur. */
  fromUserId: string;
  /** Destinataires (alias canonique). */
  recipientIds: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
//  10. AESVerificationRequest — interopérabilité AES (entrée)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Requête de vérification transfrontalière AES.
 *
 * Le pays demandeur transmet l'identité minimale d'une personne, signée
 * en JWS (RFC 7515). Le pays cible répond par {@link AESVerificationResponse}.
 */
export interface AESVerificationRequest {
  /** Identifiant de corrélation (UUID). */
  correlationId: string;
  /** Pays demandeur. */
  requestingCountry: AESCountry;
  /** Pays cible. */
  targetCountry: AESCountry;
  /** NINA (ou identifiant national équivalent BFA/NER). */
  nina: string;
  /** Nom de famille (vérification croisée). */
  lastName: string;
  /** Date de naissance (AAAA-MM-JJ). */
  birthDate: string;
  /** JWS (RFC 7515) — charge utile signée par l'État demandeur. */
  signature: string;
  /** Horodatage de l'émission (ISO 8601). */
  issuedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  11. AESVerificationResponse — interopérabilité AES (sortie)
// ──────────────────────────────────────────────────────────────────────────────

/** Réponse de vérification transfrontalière AES, signée JWS. */
export interface AESVerificationResponse {
  correlationId: string;
  /** Pays émetteur de la réponse. */
  respondingCountry: AESCountry;
  /** Identité reconnue ? */
  verified: boolean;
  /** Indice de confiance 0–100 (fuzzy matching pour homonymes / translittérations). */
  confidence: number;
  /** Liste des champs ayant matché (`['nina', 'lastName', 'birthDate']`). */
  matchFields: string[];
  /** Horodatage de la réponse (ISO 8601). */
  timestamp: string;
  /** JWS (RFC 7515) couvrant l'ensemble de la réponse. */
  signature: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  12. AuditLog — entrée du journal Merkle
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Entrée du journal d'audit chaîné Merkle (audit-service).
 *
 * Chaque modification d'une ressource sensible est journalisée avec
 * `oldValue`/`newValue` (rédaction PII via `sanitizeForLog`), signée et
 * chaînée au hash précédent — toute altération a posteriori est détectable.
 */
export interface AuditLog {
  id: string;
  /** Utilisateur ayant déclenché l'action (UUID). */
  userId: string;
  /** Action normalisée (ex. `NINA_READ`, `CORRECTION_APPROVE`). */
  action: string;
  /** Type d'entité affectée (ex. `Citizen`, `CorrectionRequest`). */
  entityType: string;
  /** Identifiant de l'entité. */
  entityId: string;
  /** Valeur précédente (sérialisée JSON, PII rédigée). */
  oldValue?: string;
  /** Nouvelle valeur (sérialisée JSON, PII rédigée). */
  newValue?: string;
  /** Adresse IP source. */
  ipAddress?: string;
  /** Rôle applicatif au moment du fait. */
  actorRole: UserRole;
  /** Empreinte Merkle du bloc courant. */
  merkleHash: string;
  /** Empreinte du bloc précédent (chaîne). */
  previousHash: string;
  /** Signature RS256 du bloc (auteur + intégrité). */
  signature: string;
  /** Horodatage serveur (ISO 8601). */
  timestamp: string;
  /** Données additionnelles non sensibles. */
  payload?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
//  13–14. Enveloppes API génériques
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Enveloppe API générique pour succès / erreur typée.
 *
 * @typeParam T - Type de la donnée portée par la réponse.
 */
export interface ApiResponse<T> {
  /** Indique si la requête a réussi. */
  success: boolean;
  /** Donnée retournée (présente si `success === true`). */
  data?: T;
  /** Détail d'erreur (présent si `success === false`). */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Message informatif (succès). */
  message?: string;
  /** Métadonnées de réponse (corrélation, version API…). */
  meta?: Record<string, unknown>;
}

/**
 * Réponse paginée standardisée — étend {@link ApiResponse} en ajoutant
 * un bloc `pagination`.
 *
 * @typeParam T - Type d'un élément de la liste.
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  /** Métadonnées de pagination. */
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
//  15. ElectoralRecord — intégrité électorale (Bloc C)
// ──────────────────────────────────────────────────────────────────────────────

/** Enregistrement électoral — vue minimale inter-services. */
export interface ElectoralRecord {
  id: string;
  /** NINA du citoyen. */
  nina: string;
  /** Bureau ou centre de vote. */
  pollingStationCode: string;
  /** Statut d'inscription. */
  registrationStatus: 'REGISTERED' | 'SUSPENDED' | 'REMOVED';
  /** Horodatage de dernière mise à jour. */
  updatedAt: string;
  /** Empreinte Merkle du lot d'inscription (optionnel). */
  batchMerkleRoot?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  16. KioskSession — session borne Electron (Bloc E)
// ──────────────────────────────────────────────────────────────────────────────

/** Session borne kiosque (Electron) — contexte utilisateur limité. */
export interface KioskSession {
  /** Identifiant de session (opaque). */
  sessionId: string;
  /** Code borne (mairie). */
  kioskId: string;
  /** Pays. */
  country: AESCountry;
  /** Langue UI active. */
  language: Language;
  /** Début de session (ISO 8601). */
  startedAt: string;
  /** Fin prévue ou réelle. */
  expiresAt: string;
  /** Mode « assistant » : agent présent oui/non. */
  assistedMode: boolean;
}
