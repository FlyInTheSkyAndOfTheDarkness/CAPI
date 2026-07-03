import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';

/**
 * Шифрование секретов (токены CRM/пикселей) в БД — AES-256-GCM.
 * Ключ выводится из ENCRYPTION_KEY (или JWT_SECRET как запасной вариант).
 * decrypt() возвращает значение как есть, если оно не в формате enc:v1: —
 * это позволяет прозрачно работать со старыми plaintext-записями.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('ENCRYPTION_KEY') ?? config.get<string>('JWT_SECRET') ?? 'dev-insecure-key';
    if (secret === 'dev-insecure-key') {
      this.logger.warn('ENCRYPTION_KEY не задан — секреты шифруются небезопасным dev-ключом');
    }
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plain: string): string;
  encrypt(plain: null | undefined): null;
  encrypt(plain: string | null | undefined): string | null;
  encrypt(plain: string | null | undefined): string | null {
    if (plain == null || plain === '') return plain ?? null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(value: string | null | undefined): string | null {
    if (value == null) return null;
    if (!value.startsWith(PREFIX)) return value; // легаси plaintext
    try {
      const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const enc = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (e) {
      this.logger.error(`Не удалось расшифровать значение: ${String(e)}`);
      throw new Error('Ошибка расшифровки секрета — проверьте ENCRYPTION_KEY');
    }
  }
}
