/**
 * @file        anonymize.spec.ts
 * @description Tests unitaires des primitives d'anti-désanonymisation
 *              (anonymize.ts, THREAT-MODEL #12). Vérifie : troncature IP (INET
 *              valide, host masqué), hachage déterministe du correlationId
 *              (corrélation SOC préservée, valeur brute non exposée), et
 *              détection des routes sensibles (SIGAC).
 * @module      audit-service/test
 */
import { hashCorrelationId, isSensitiveRoute, truncateIp } from '../../src/audit/anonymize.js';

describe('anonymize (anti-désanonymisation #12)', () => {
  describe('isSensitiveRoute', () => {
    it('reconnaît le canal SIGAC (vulnerability.)', () => {
      expect(isSensitiveRoute('vulnerability.report.created', ['vulnerability.'])).toBe(true);
    });
    it('laisse passer les routes non sensibles', () => {
      expect(isSensitiveRoute('citizen.created', ['vulnerability.'])).toBe(false);
    });
    it('gère une routing key vide / des préfixes vides', () => {
      expect(isSensitiveRoute('', ['vulnerability.'])).toBe(false);
      expect(isSensitiveRoute('vulnerability.x', [''])).toBe(false);
    });
  });

  describe('truncateIp', () => {
    it('masque le dernier octet IPv4 (/24, INET valide)', () => {
      expect(truncateIp('41.221.10.37')).toBe('41.221.10.0');
    });
    it('masque l’hôte IPv6 (/48)', () => {
      expect(truncateIp('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd::');
    });
    it('préserve null', () => {
      expect(truncateIp(null)).toBeNull();
    });
    it('préserve la corrélation par sous-réseau (même /24 → même valeur)', () => {
      expect(truncateIp('41.221.10.37')).toBe(truncateIp('41.221.10.250'));
      expect(truncateIp('41.221.10.37')).not.toBe(truncateIp('41.221.11.37'));
    });
  });

  describe('hashCorrelationId', () => {
    it('est déterministe (corrélation SOC préservée)', () => {
      const a = hashCorrelationId('corr-abc', 'pepper');
      const b = hashCorrelationId('corr-abc', 'pepper');
      expect(a).toBe(b);
    });
    it('n’expose pas la valeur brute et reste ≤ 100 chars', () => {
      const h = hashCorrelationId('corr-secret-uuid', 'pepper')!;
      expect(h).toMatch(/^h:[0-9a-f]{32}$/);
      expect(h).not.toContain('corr-secret-uuid');
      expect(h.length).toBeLessThanOrEqual(100);
    });
    it('le pepper change le hash (anti-dictionnaire)', () => {
      expect(hashCorrelationId('corr-abc', 'pepper-1')).not.toBe(
        hashCorrelationId('corr-abc', 'pepper-2'),
      );
    });
    it('préserve null', () => {
      expect(hashCorrelationId(null, 'pepper')).toBeNull();
    });
  });
});
