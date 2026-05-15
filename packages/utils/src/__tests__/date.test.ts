/**
 * @file        date.test.ts
 * @description Tests Jest pour calculateAge.
 * @module      @nina-aes/utils
 */

import { calculateAge } from '../date';

describe('calculateAge', () => {
  it('calcule l’âge en années révolues', () => {
    expect(calculateAge('2000-01-01', new Date('2026-01-02'))).toBe(26);
  });

  it('soustrait 1 si l’anniversaire n’est pas encore passé', () => {
    expect(calculateAge('2000-12-31', new Date('2026-01-01'))).toBe(25);
  });

  it('retourne 0 le jour même de la naissance', () => {
    expect(calculateAge('2026-01-01', new Date('2026-01-01'))).toBe(0);
  });

  it('rejette une date future', () => {
    expect(() => calculateAge('2030-01-01', new Date('2026-01-01'))).toThrow();
  });

  it('rejette une date invalide', () => {
    expect(() => calculateAge('not-a-date')).toThrow(/invalide/i);
  });

  it('accepte une instance Date', () => {
    const d = new Date('1990-06-15');
    expect(calculateAge(d, new Date('2026-06-14'))).toBe(35);
    expect(calculateAge(d, new Date('2026-06-15'))).toBe(36);
  });
});
