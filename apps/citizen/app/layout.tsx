/**
 * @file        app/layout.tsx
 * @description Layout racine (sans locale) — fournit `<html>` et charge les
 *              styles globaux. La balise `lang` est définie dans le layout
 *              `[locale]/layout.tsx` qui reçoit la locale active.
 *
 * @module      @nina-aes/citizen
 */

import './globals.css';

/**
 * Le layout racine **doit** rendre `<html>` et `<body>`. La locale concrète
 * (lang attribute + dir) est définie par le layout enfant `[locale]/layout.tsx`.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
