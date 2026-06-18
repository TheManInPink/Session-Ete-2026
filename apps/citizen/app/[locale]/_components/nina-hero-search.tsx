/**
 * @file        nina-hero-search.tsx
 * @description Composant client — formulaire de recherche NINA sur l'accueil PC-01.
 *              Valide le NINA puis navigue vers `/[locale]/nina/[nina]` (PC-02).
 *
 * @module      @nina-aes/citizen
 */

'use client';

import { validateNina } from '@nina-aes/utils';
import { Button } from '@nina-aes/ui/components/button';
import { NinaInput } from '@nina-aes/ui/components/forms/nina-input';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export function NinaHeroSearch() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('citizen.search');
  const [nina, setNina] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const isValid = validateNina(nina);

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    router.push(`/${locale}/nina/${nina}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 sm:flex sm:gap-3 sm:space-y-0" noValidate>
      <div className="flex-1">
        <NinaInput
          value={nina}
          onChange={setNina}
          autoFocus
          label={t('ninaLabel')}
          helper={t('help')}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={!isValid}
        loading={submitting}
        className="w-full sm:w-auto sm:min-w-32"
      >
        {t('submit')}
      </Button>
    </form>
  );
}
