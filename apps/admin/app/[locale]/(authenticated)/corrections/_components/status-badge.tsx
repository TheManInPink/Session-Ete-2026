/**
 * @file        status-badge.tsx
 * @description Badge coloré pour l'état d'une demande de correction.
 *              Mapping :
 *                UNDER_REVIEW     → warning (jaune)
 *                APPROVED         → success (vert)
 *                REJECTED         → destructive (rouge)
 *                AWAITING_DOCUMENT → info (bleu)
 *                DRAFT/SUBMITTED/CANCELLED → muted
 *
 * @module      @nina-aes/admin
 */

import { Badge } from '@nina-aes/ui/components/badge';
import { useTranslations } from 'next-intl';
import type { AdminCorrectionStatus } from '../../../../../lib/mock-corrections';

const TONES: Record<AdminCorrectionStatus, string> = {
  DRAFT: 'bg-bg-muted text-fg-muted',
  SUBMITTED: 'bg-bg-muted text-fg-muted',
  CANCELLED: 'bg-bg-muted text-fg-muted',
  UNDER_REVIEW: 'bg-warning-50 text-warning-700',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
  AWAITING_DOCUMENT: 'bg-info-50 text-info-700',
};

export function StatusBadge({ status }: { status: AdminCorrectionStatus }) {
  const t = useTranslations('admin.corrections.status');
  return <Badge className={TONES[status]}>{t(status as never)}</Badge>;
}
