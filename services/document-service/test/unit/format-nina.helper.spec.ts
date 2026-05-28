import { formatNinaHelper } from '../../src/templates/helpers/format-nina.helper';

describe('formatNinaHelper()', () => {
  it('formate un NINA valide en groupes lisibles', () => {
    expect(formatNinaHelper('19850315123456A')).toBe('1 98 50 3 15 123 456 A');
  });

  it('retourne la valeur brute si NINA invalide (longueur)', () => {
    expect(formatNinaHelper('123')).toBe('123');
  });

  it('retourne la valeur brute si lettre de contrôle minuscule', () => {
    expect(formatNinaHelper('19850315123456a')).toBe('19850315123456a');
  });

  it('gère les valeurs non-string sans crasher', () => {
    expect(formatNinaHelper(null)).toBe('');
    expect(formatNinaHelper(undefined)).toBe('');
    expect(formatNinaHelper(42)).toBe('42');
  });
});
