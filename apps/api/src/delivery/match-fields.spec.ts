import { extractMatchFields } from './match-fields';

describe('extractMatchFields', () => {
  it('авто-детект click-id и полей по имени', () => {
    const r = extractMatchFields([
      { name: 'GCLID', value: 'abc123' },
      { name: 'Facebook click (fbclid)', value: 'fbxyz' },
      { name: 'ttclid', value: 'tt777' },
      { name: 'Город', value: 'Алматы' },
      { name: 'Индекс', value: '050000' },
    ]);
    expect(r.gclid).toBe('abc123');
    expect(r.fbclid).toBe('fbxyz');
    expect(r.ttclid).toBe('tt777');
    expect(r.city).toBe('Алматы');
    expect(r.zip).toBe('050000');
  });

  it('явный fieldMap переопределяет авто-детект (Битрикс UF_CRM_*)', () => {
    const r = extractMatchFields([{ code: 'UF_CRM_123', value: 'g1' }], { gclid: 'UF_CRM_123' });
    expect(r.gclid).toBe('g1');
  });

  it('пустые/пробельные значения игнорируются', () => {
    const r = extractMatchFields([{ name: 'gclid', value: '   ' }]);
    expect(r.gclid).toBeUndefined();
  });

  it('ограничение ключей (keys) работает', () => {
    const r = extractMatchFields([{ name: 'gclid', value: 'x' }, { name: 'город', value: 'Астана' }], null, [
      'city',
    ]);
    expect(r.gclid).toBeUndefined();
    expect(r.city).toBe('Астана');
  });
});
