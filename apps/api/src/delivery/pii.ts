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
