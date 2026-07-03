import { createHash } from 'crypto';
import {
  hashEmail,
  hashPhoneForMeta,
  hashPhoneForTiktok,
  normalizeEmail,
  normalizePhoneDigits,
  sha256,
} from './pii';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('pii', () => {
  it('sha256 совпадает с эталоном', () => {
    expect(sha256('test')).toBe(sha('test'));
  });

  it('normalizeEmail приводит регистр и обрезает пробелы', () => {
    expect(normalizeEmail('  Test@Example.COM ')).toBe('test@example.com');
  });

  it('hashEmail хеширует нормализованный email', () => {
    expect(hashEmail('  Test@Example.COM ')).toBe(sha('test@example.com'));
  });

  it.each([
    ['8 (999) 000-00-00', '79990000000'],
    ['+7 999 000 00 00', '79990000000'],
    ['0079990000000', '79990000000'],
    ['7-999-000-00-00', '79990000000'],
  ])('normalizePhoneDigits(%s) = %s', (input, expected) => {
    expect(normalizePhoneDigits(input)).toBe(expected);
  });

  it('hashPhoneForMeta — без плюса', () => {
    expect(hashPhoneForMeta('8-999-000-00-00')).toBe(sha('79990000000'));
  });

  it('hashPhoneForTiktok — с плюсом (E.164)', () => {
    expect(hashPhoneForTiktok('8-999-000-00-00')).toBe(sha('+79990000000'));
  });
});
