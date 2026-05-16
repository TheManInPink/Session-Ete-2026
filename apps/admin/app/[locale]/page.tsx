/**
 * @file        [locale]/page.tsx
 * @description Racine de la console agent — redirige vers `/[locale]/dashboard`.
 *              Cette page existe pour que `/fr` et `/bm` ne renvoient pas 404.
 * @module      @nina-aes/admin
 */

import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminRoot({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
