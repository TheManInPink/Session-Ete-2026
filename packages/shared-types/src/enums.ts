/**
 * @file        enums.ts
 * @description Énumérations métier partagées entre les applications et microservices NINA-AES.
 * @module      @nina-aes/shared-types
 */

/**
 * Sexe déclaré (aligné sur le premier chiffre du NINA et les registres d'état civil).
 */
export enum Sex {
  /** Masculin */
  MALE = 'MALE',
  /** Féminin */
  FEMALE = 'FEMALE',
  /** Non renseigné ou non binaire (traitement inclusif côté UI) */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Statut matrimonial (champ FDI / registres).
 */
export enum MaritalStatus {
  SINGLE = 'SINGLE',
  MARRIED = 'MARRIED',
  DIVORCED = 'DIVORCED',
  WIDOWED = 'WIDOWED',
  SEPARATED = 'SEPARATED',
  CIVIL_UNION = 'CIVIL_UNION',
}

/**
 * Cycle de vie d'une demande de correction NINA (workflow agent / citoyen).
 */
export enum CorrectionStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * Rôles applicatifs (RBAC). Distincts des rôles Keycloak mais mappables 1:1.
 */
export enum UserRole {
  CITIZEN = 'CITIZEN',
  AGENT = 'AGENT',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR',
  ANTICORRUPTION_INSPECTOR = 'ANTICORRUPTION_INSPECTOR',
}

/**
 * Catégories de vulnérabilité pour priorisation USSD / file d'attente physique.
 */
export enum VulnerabilityCategory {
  ELDERLY = 'ELDERLY',
  DISABLED = 'DISABLED',
  PREGNANT = 'PREGNANT',
  CHRONIC_ILL = 'CHRONIC_ILL',
  ILLITERATE = 'ILLITERATE',
  DIASPORA = 'DIASPORA',
}

/**
 * Niveau de priorité opérationnelle (file d'attente, support terrain).
 */
export enum PriorityLevel {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

/**
 * Statut d'un rendez-vous CTDEC / antenne RAVEC.
 */
export enum AppointmentStatus {
  REQUESTED = 'REQUESTED',
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

/**
 * Cycle de vie d'une directive de gouvernance (SGOGT).
 */
export enum DirectiveStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  IN_PROGRESS = 'IN_PROGRESS',
  ESCALATED = 'ESCALATED',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Gravité d'une alerte (anticorruption, intégrité, sécurité).
 */
export enum AlertSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Pays membres de l’AES couverts par l’interopérabilité transfrontalière.
 */
export enum AESCountry {
  MLI = 'MLI',
  BFA = 'BFA',
  NER = 'NER',
}

/**
 * Langues nationales supportées (UI + USSD + notifications).
 * Codes internes projet — à mapper vers locales et fournisseurs SMS/USSD.
 */
export enum Language {
  FR = 'FR',
  BM = 'BM',
  SNK = 'SNK',
  FF = 'FF',
  TMQ = 'TMQ',
  HAU = 'HAU',
  MOS = 'MOS',
  DJE = 'DJE',
}
