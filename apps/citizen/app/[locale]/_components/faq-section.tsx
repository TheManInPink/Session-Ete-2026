/**
 * @file        faq-section.tsx
 * @description FAQ citoyenne (charte PC-01) — `Accordion` shadcn/Radix, 5
 *              questions issues de l'i18n `citizen.home.faq`. Partagée entre
 *              l'accueil (PC-01) et la page « Aide ».
 *
 * @module      @nina-aes/citizen
 */

'use client';

import { useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@nina-aes/ui/components/accordion';

const ITEMS = ['1', '2', '3', '4', '5'] as const;

export function FaqSection({ className }: { className?: string }) {
  const t = useTranslations('citizen.home.faq');

  return (
    <div className={className}>
      <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
      <Accordion type="single" collapsible className="mt-6">
        {ITEMS.map((n) => (
          <AccordionItem key={n} value={`item-${n}`}>
            <AccordionTrigger className="text-left text-base">{t(`q${n}`)}</AccordionTrigger>
            <AccordionContent className="leading-relaxed">{t(`a${n}`)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
