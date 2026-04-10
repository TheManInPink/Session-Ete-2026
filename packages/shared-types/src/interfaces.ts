/**
 * @file        interfaces.ts
 * @description Interfaces métier transverses (citoyen, gouvernance, audit, interop AES).
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

/**
 * Localisation hiérarchique sur 8 niveaux (FDI / résidence / naissance).
 */
export interface Location {
  /** Pays (code ISO 3166-1 alpha-3 recommandé, ex. MLI) */
  country: string;
  /** Région administrative */
  region: string;
  /** Cercle */
  cercle: string;
  /** Commune */
  commune: string;
  /** Quartier ou secteur */
  quartier: string;
  /** Fraction (subdivision communale) */
  fraction: string;
  /** Village */
  village: string;
  /** Hameau ou lieu-dit */
  hameau: string;
}

/**
 * Représentation d’un parent figurant sur la Fiche Descriptive Individuelle.
 */
export interface Parent {
  /** Lien de filiation */
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN';
  /** Prénom(s) */
  firstName: string;
  /** Nom de famille */
  lastName: string;
  /** NINA si connu (optionnel) */
  nina?: string;
}

/**
 * Citoyen enregistré — vue agrégée pour API (hors secrets).
 */
export interface Citizen {
  /** Numéro NINA (15 caractères) */
  nina: string;
  /** Prénom(s) usuel(s) */
  firstName: string;
  /** Nom */
  lastName: string;
  /** Sexe */
  sex: Sex;
  /** Date de naissance ISO 8601 (AAAA-MM-JJ) */
  birthDate: string;
  /** Lieu de naissance (hiérarchie 8 niveaux) */
  birthPlace: Location;
  /** Lieu de résidence actuelle */
  residence: Location;
  /** Statut matrimonial */
  maritalStatus: MaritalStatus;
  /** Profession libellé court */
  profession: string;
  /** Père / mère selon FDI */
  parents: Parent[];
  /** Langue préférée pour canaux inclusifs */
  preferredLanguage?: Language;
  /** Métadonnées d’audit (version fiche, etc.) */
  metadata?: Record<string, string>;
}

/**
 * Demande de correction (saisie erronée, homonymes, module IA).
 */
export interface CorrectionRequest {
  id: string;
  /** NINA concerné */
  nina: string;
  /** Champ métier ciblé (ex. cercle, commune) */
  fieldKey: string;
  /** Valeur actuelle en base */
  currentValue: string;
  /** Valeur proposée par le citoyen ou l’IA */
  proposedValue: string;
  /** Score de confiance IA (0–100), si applicable */
  aiConfidence?: number;
  status: CorrectionStatus;
  /** Identifiant du demandeur (utilisateur Keycloak / NINA) */
  requestedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Rendez-vous physique ou téléphonique (CTDEC / antenne).
 */
export interface Appointment {
  id: string;
  /** NINA du citoyen */
  nina: string;
  status: AppointmentStatus;
  /** Priorité opérationnelle */
  priority: PriorityLevel;
  /** Catégorie vulnérabilité (file prioritaire) */
  vulnerability?: VulnerabilityCategory;
  /** Créneau horaire ISO 8601 (début) */
  startsAt: string;
  /** Créneau horaire ISO 8601 (fin) */
  endsAt: string;
  /** Code local (ex. antenne Bamako) */
  siteCode: string;
  /** Langue préférée pour rappel */
  language: Language;
  /** Notes internes */
  notes?: string;
}

/**
 * Alerte anticorruption (SIGAC) — signalement structuré.
 */
export interface CorruptionAlert {
  id: string;
  severity: AlertSeverity;
  /** Titre court pour tableaux de bord */
  title: string;
  /** Détail factuel (non PII en clair si chiffrement bout-en-bout) */
  description: string;
  /** Pays concerné */
  country: AESCountry;
  /** Référence dossier (ex. NINA, contrat) */
  referenceId?: string;
  /** Horodatage de création */
  createdAt: string;
  /** Identifiant du rapporteur (rôle inspecteur) */
  reportedByUserId?: string;
}

/**
 * Détail du score d’intégrité d’un agent (0–100) avec 5 facteurs explicites.
 */
export interface AgentIntegrityScore {
  /** Score global 0–100 */
  totalScore: number;
  /** Facteurs pondérés */
  breakdown: {
    /** Qualité des données saisies / corrections */
    dataQuality: number;
    /** Temps de traitement des dossiers */
    responseTime: number;
    /** Respect des procédures RAVEC */
    complianceRate: number;
    /** Résolution des plaintes citoyennes */
    complaintResolution: number;
    /** Conformité audits internes */
    auditCompliance: number;
  };
  /** Période d’agrégation (ex. mois civil) */
  periodStart: string;
  periodEnd: string;
  /** Identifiant métier de l’agent */
  agentUserId: string;
}

/**
 * Directive gouvernementale (SGOGT) avec niveau d’escalade.
 */
export interface GovernanceDirective {
  id: string;
  title: string;
  body: string;
  status: DirectiveStatus;
  /** 0 = niveau local, 1+ = escalade hiérarchique */
  escalationLevel: number;
  /** Pays concerné */
  country: AESCountry;
  /** Référence dossier (ex. NINA, contrat) */
  referenceCode?: string;
  createdAt: string;
  updatedAt: string;
  /** Créateur (id utilisateur) */
  createdByUserId: string;
}

/**
 * Message signé (Ed25519) entre acteurs institutionnels.
 */
export interface GovernanceMessage {
  id: string;
  /** Contenu affichable (texte) */
  body: string;
  /** Signature detached Ed25519 (base64url ou base64) */
  signatureEd25519: string;
  /** Empreinte de la clé publique utilisée (base64) */
  publicKeyFingerprint: string;
  /** Statut de lecture côté destinataire */
  readStatus: 'unread' | 'read';
  /** Horodatage serveur (ISO 8601) */
  serverTimestamp: string;
  /** Expéditeur */
  fromUserId: string;
  /** Destinataire(s) */
  toUserIds: string[];
}

/**
 * Requête d’interopérabilité AES — vérif transfrontalière (JWS).
 */
export interface AESVerificationRequest {
  /** Identifiant de corrélation */
  correlationId: string;
  /** Pays demandeur */
  requestingCountry: AESCountry;
  /** Pays cible */
  targetCountry: AESCountry;
  /** NINA ou identifiant national chiffré selon protocole */
  subjectId: string;
  /** JWS (RFC 7515) — charge utile signée par l’État demandeur */
  assertionJws: string;
  /** Horodatage de l’émission */
  issuedAt: string;
}

/**
 * Réponse d’interopérabilité AES — résultat signé (JWS).
 */
export interface AESVerificationResponse {
  correlationId: string;
  /** Pays émetteur de la réponse */
  respondingCountry: AESCountry;
  /** Statut métier (ex. MATCH, NO_MATCH, PARTIAL) */
  verificationStatus: 'MATCH' | 'NO_MATCH' | 'PARTIAL' | 'ERROR';
  /** JWS portant le résultat et métadonnées minimales */
  resultJws: string;
  /** Horodatage de la réponse */
  issuedAt: string;
}

/**
 * Entrée de journal d’audit (chaînage Merkle côté `audit-service`).
 */
export interface AuditLog {
  id: string;
  /** Action normalisée (ex. NINA_READ, CORRECTION_APPROVE) */
  action: string;
  /** Rôle applicatif au moment du fait */
  actorRole: UserRole;
  /** Identifiant du sujet (ex. NINA, id dossier) */
  resourceId: string;
  /** Empreinte Merkle du bloc courant */
  merkleHash: string;
  /** Empreinte du bloc précédent (chaîne) */
  previousHash: string;
  /** Horodatage serveur */
  timestamp: string;
  /** Données additionnelles non sensibles */
  payload?: Record<string, unknown>;
}

/**
 * Enveloppe API générique pour succès / erreur typée.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Message informatif (succès) */
  message?: string;
}

/**
 * Réponse paginée standardisée.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * Enregistrement électoral (intégrité — Bloc C) — vue minimale inter-services.
 */
export interface ElectoralRecord {
  id: string;
  /** NINA du citoyen */
  nina: string;
  /** Bureau ou centre de vote */
  pollingStationCode: string;
  /** Statut d’inscription */
  registrationStatus: 'REGISTERED' | 'SUSPENDED' | 'REMOVED';
  /** Horodatage de dernière mise à jour */
  updatedAt: string;
  /** Empreinte Merkle du lot d’inscription (optionnel) */
  batchMerkleRoot?: string;
}

/**
 * Session borne kiosque (Electron) — contexte utilisateur limité.
 */
export interface KioskSession {
  /** Identifiant de session (opaque) */
  sessionId: string;
  /** Code borne (mairie) */
  kioskId: string;
  /** Pays */
  country: AESCountry;
  /** Langue UI active */
  language: Language;
  /** Début de session (ISO 8601) */
  startedAt: string;
  /** Fin prévue ou réelle */
  expiresAt: string;
  /** Mode « assistant » : agent présent oui/non */
  assistedMode: boolean;
}
