/**
 * @file        status-badge.tsx
 * @description Badge coloré pour l'état d'une demande de correction, typé sur
 *              le contrat `CorrectionStatus` de @nina-aes/api-client.
 *              Mapping :
 *                UNDER_REVIEW → warning (jaune)
 *                APPROVED     → success (vert)
 *                REJECTED     → destructive (rouge)
 *                DRAFT / SUBMITTED / CANCELLED → muted
 *
 *              L'ancien statut `AWAITING_DOCUMENT` (mock local) n'existe pas
 *              dans le backend : il a été retiré de la vue (dégradation
 *              honnête, cf. lib/corrections/view-model.ts).
 *
 * @module      @nina-aes/admin
 */

import { Badge } from '@nina-aes/ui/components/badge';
import { useTranslations } from 'next-intl';
import type { CorrectionStatus } from '@nina-aes/api-client';

const TONES: Record<CorrectionStatus, string> = {
  DRAFT: 'bg-bg-muted text-fg-muted',
  SUBMITTED: 'bg-bg-muted text-fg-muted',
  CANCELLED: 'bg-bg-muted text-fg-muted',
  UNDER_REVIEW: 'bg-warning-50 text-warning-700',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
};

/**
 * Libellés locaux des statuts SANS clé i18n `admin.corrections.status.*`
 * (états du cycle de vie citoyen, absents du magasin mock vue agent mais
 * possibles sur le fil réel) — évite une clé next-intl manquante au rendu.
 */
const LOCAL_LABELS: Partial<Record<CorrectionStatus, string>> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumise',
  CANCELLED: 'Annulée',
};

export function StatusBadge({ status }: { status: CorrectionStatus }) {
  const t = useTranslations('admin.corrections.status');
  return <Badge className={TONES[status]}>{LOCAL_LABELS[status] ?? t(status as never)}</Badge>;
}
