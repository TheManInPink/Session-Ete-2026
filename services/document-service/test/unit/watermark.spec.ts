import { computeWatermark } from '../../src/fdi/watermark';

describe('computeWatermark()', () => {
  const jti = '01918f8b-1234-7000-8000-000000000001';

  it('retourne 12 caractères hex', () => {
    const wm = computeWatermark('1.2.3.4', 'Mozilla/5.0', jti);
    expect(wm).toMatch(/^[a-f0-9]{12}$/);
  });

  it('est déterministe pour mêmes entrées', () => {
    const a = computeWatermark('1.2.3.4', 'UA', jti);
    const b = computeWatermark('1.2.3.4', 'UA', jti);
    expect(a).toBe(b);
  });

  it('change si IP change', () => {
    expect(computeWatermark('1.2.3.4', 'UA', jti)).not.toBe(computeWatermark('1.2.3.5', 'UA', jti));
  });

  it("change si jti change (deux émissions n'ont pas le même wm)", () => {
    const jti2 = '01918f8b-1234-7000-8000-000000000002';
    expect(computeWatermark('1.2.3.4', 'UA', jti)).not.toBe(
      computeWatermark('1.2.3.4', 'UA', jti2),
    );
  });
});
