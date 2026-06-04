/**
 * @file        geo.spec.ts
 * @description Tests de la distance de Haversine.
 * @module      appointment-service/test
 */
import { haversineKm } from '../../src/common/geo.util.js';

describe('haversineKm', () => {
  it('renvoie 0 pour deux points identiques', () => {
    expect(haversineKm(12.6392, -8.0029, 12.6392, -8.0029)).toBeCloseTo(0, 5);
  });

  it('est symétrique', () => {
    const a = haversineKm(12.6392, -8.0029, 11.3176, -5.6665);
    const b = haversineKm(11.3176, -5.6665, 12.6392, -8.0029);
    expect(a).toBeCloseTo(b, 6);
  });

  it('approxime la distance Bamako ↔ Sikasso (~270 km)', () => {
    // Centroïdes officiels (data/mali). Distance réelle ≈ 265–290 km.
    const d = haversineKm(12.6392, -8.0029, 11.3176, -5.6665);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(320);
  });

  it('approxime la distance Bamako ↔ Mopti (~460 km)', () => {
    const d = haversineKm(12.6392, -8.0029, 14.4843, -4.1827);
    expect(d).toBeGreaterThan(420);
    expect(d).toBeLessThan(520);
  });
});
