import { canonicalJson } from '../../src/fdi/canonical';

describe('canonicalJson()', () => {
  it('tri stable des clés (ordre alphabétique récursif)', () => {
    const a = canonicalJson({ b: 1, a: { d: 4, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 4 }, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it('élimine les undefined sans casser le hash', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('arrays préservent leur ordre (positionnel)', () => {
    expect(canonicalJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it('imbrications profondes', () => {
    const out = canonicalJson({
      fdi: { language: 'fra', documentId: 'd1' },
      citizen: { nina: 'X', firstName: 'A' },
    });
    expect(out).toBe(
      '{"citizen":{"firstName":"A","nina":"X"},"fdi":{"documentId":"d1","language":"fra"}}',
    );
  });
});
