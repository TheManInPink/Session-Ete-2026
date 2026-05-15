/**
 * @file        nina.test.ts
 * @description Tests Jest pour les utilitaires NINA.
 * @module      @nina-aes/utils
 */

import {
  computeControlLetter,
  formatNina,
  maskNina,
  normalizeNina,
  parseNina,
  validateNina,
  validateNinaChecksum,
} from '../nina';

describe('NINA — normalisation', () => {
  it('supprime espaces, tirets et passe en majuscules', () => {
    expect(normalizeNina('1 89 03 1 02 015 042 z')).toBe('189031020150 42Z'.replace(' ', ''));
    expect(normalizeNina('1-89-03-1-02-015-042-Z')).toBe('189031020150 42Z'.replace(' ', ''));
    expect(normalizeNina('  189031020150 42z  ').replace(' ', '')).toBe('18903102015042Z');
  });

  it('retourne une chaîne vide si entrée vide ou null', () => {
    expect(normalizeNina('')).toBe('');
    expect(normalizeNina(undefined as unknown as string)).toBe('');
  });
});

describe('NINA — calcul lettre de contrôle', () => {
  it('produit une lettre dans l’alphabet sans I ni O', () => {
    const letter = computeControlLetter('18903102015042');
    expect(letter).toMatch(/^[A-HJ-NP-Z]$/);
  });

  it('rejette une entrée non numérique ou de mauvaise longueur', () => {
    expect(() => computeControlLetter('123')).toThrow();
    expect(() => computeControlLetter('1890310201504X')).toThrow();
  });

  it('est déterministe pour les mêmes 14 chiffres', () => {
    expect(computeControlLetter('18903102015042')).toBe(
      computeControlLetter('18903102015042'),
    );
  });
});

describe('NINA — validation', () => {
  it('valide un NINA bien formé avec lettre correcte', () => {
    const digits = '18903102015042';
    const letter = computeControlLetter(digits);
    expect(validateNina(digits + letter)).toBe(true);
    expect(validateNinaChecksum(digits + letter)).toBe(true);
  });

  it('rejette une lettre incorrecte', () => {
    const digits = '18903102015042';
    const letter = computeControlLetter(digits);
    const wrong = letter === 'A' ? 'B' : 'A';
    expect(validateNina(digits + wrong)).toBe(false);
  });

  it('rejette les formats invalides', () => {
    expect(validateNina('')).toBe(false);
    expect(validateNina('38903102015042Z')).toBe(false); // sexe ∉ {1,2}
    expect(validateNina('189031020150421')).toBe(false); // pas de lettre finale
  });

  it('tolère les espaces grâce à normalizeNina', () => {
    const digits = '18903102015042';
    const letter = computeControlLetter(digits);
    expect(validateNina(`1 89 03 1 02 015 042 ${letter}`)).toBe(true);
  });
});

describe('NINA — formatage et masquage', () => {
  const digits = '18903102015042';
  const valid = digits + computeControlLetter(digits);

  it('formate avec espaces selon la structure officielle', () => {
    const formatted = formatNina(valid);
    expect(formatted.split(' ')).toHaveLength(8);
    expect(formatted.replace(/\s/g, '')).toBe(valid);
  });

  it('masque le centre du NINA pour les logs', () => {
    const masked = maskNina(valid);
    expect(masked.length).toBe(15);
    expect(masked.slice(0, 2)).toBe(valid.slice(0, 2));
    expect(masked.slice(-2)).toBe(valid.slice(-2));
    expect(masked.slice(2, -2)).toBe('*'.repeat(11));
  });

  it('masque tout si la chaîne est trop courte', () => {
    expect(maskNina('AB')).toBe('**');
  });
});

describe('NINA — parseNina', () => {
  const digits = '18903102015042';
  const valid = digits + computeControlLetter(digits);

  it('extrait correctement les composants', () => {
    const p = parseNina(valid);
    expect(p.sexe).toBe(1);
    expect(p.anneeNaissance).toBe('89');
    expect(p.moisNaissance).toBe('03');
    expect(p.region).toBe('1');
    expect(p.cercle).toBe('02');
    expect(p.commune).toBe('015');
    expect(p.sequentiel).toBe('042');
    expect(p.lettreControle).toBe(valid[14]);
  });

  it('lance une erreur explicite si le format est invalide', () => {
    expect(() => parseNina('XYZ')).toThrow(/Format NINA invalide/);
  });
});
