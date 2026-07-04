import { createHash } from 'crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Приводит телефон к цифрам с кодом страны.
 * Российский формат 8XXXXXXXXXX (11 цифр) конвертируется в 7XXXXXXXXXX.
 * Ведущие нули удаляются — требование Meta к нормализации перед хешированием.
 */
export function normalizePhoneDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }
  return digits.replace(/^0+/, '');
}

export function hashEmail(email: string): string {
  return sha256(normalizeEmail(email));
}

/** Meta: SHA-256 от цифр телефона с кодом страны, без «+». */
export function hashPhoneForMeta(phone: string): string {
  return sha256(normalizePhoneDigits(phone));
}

/** TikTok: SHA-256 от телефона в формате E.164 (с «+»). */
export function hashPhoneForTiktok(phone: string): string {
  return sha256(`+${normalizePhoneDigits(phone)}`);
}

/**
 * Имя/город: lowercase + trim, только буквы (убираем пробелы, пунктуацию, цифры) —
 * нормализация Meta/TikTok для fn/ln/ct. Возвращает undefined, если после
 * очистки пусто (чтобы не слать хеш пустой строки).
 */
export function hashPerson(value: string): string | undefined {
  const norm = value.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
  return norm ? sha256(norm) : undefined;
}

/** Страна: 2-буквенный код в нижнем регистре, если распознан; иначе как есть. */
export function hashCountry(value: string): string | undefined {
  const norm = value.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
  return norm ? sha256(norm) : undefined;
}

/** Индекс: lowercase, без пробелов. */
export function hashZip(value: string): string | undefined {
  const norm = value.trim().toLowerCase().replace(/\s+/g, '');
  return norm ? sha256(norm) : undefined;
}

/**
 * Собирает Meta fbc из fbclid: fb.1.<время_клика_мс>.<fbclid>.
 * Если значение уже в формате fb.1.* — возвращаем как есть.
 */
export function buildFbc(fbclid: string, eventTimeSec: number): string {
  if (fbclid.startsWith('fb.')) return fbclid;
  return `fb.1.${eventTimeSec * 1000}.${fbclid}`;
}
