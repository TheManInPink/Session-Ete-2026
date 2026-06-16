/**
 * @file        [locale]/page.tsx
 * @description Racine du portail gouvernance — redirige vers
 *              `/[locale]/messagerie`. Existe pour que `/fr` ne renvoie pas 404.
 * @module      @nina-aes/governance
 */

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function GovernanceRoot({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}/messagerie`);
}
