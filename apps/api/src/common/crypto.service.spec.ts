import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

function makeService(key = 'test-encryption-key'): CryptoService {
  const config = {
    get: (name: string) => (name === 'ENCRYPTION_KEY' ? key : undefined),
  } as unknown as ConfigService;
  return new CryptoService(config);
}

describe('CryptoService', () => {
  it('шифрует и расшифровывает обратно', () => {
    const c = makeService();
    const enc = c.encrypt('super-secret-token');
    expect(enc).not.toBe('super-secret-token');
    expect(enc!.startsWith('enc:v1:')).toBe(true);
    expect(c.decrypt(enc)).toBe('super-secret-token');
  });

  it('null и пустая строка проходят без шифрования', () => {
    const c = makeService();
    expect(c.encrypt(null)).toBeNull();
    expect(c.encrypt(undefined)).toBeNull();
    expect(c.encrypt('')).toBe('');
    expect(c.decrypt(null)).toBeNull();
  });

  it('легаси plaintext возвращается при decrypt как есть', () => {
    const c = makeService();
    expect(c.decrypt('legacy-plaintext-token')).toBe('legacy-plaintext-token');
  });

  it('каждый вызов даёт новый шифртекст (случайный IV)', () => {
    const c = makeService();
    expect(c.encrypt('x')).not.toBe(c.encrypt('x'));
  });

  it('чужой ключ не может расшифровать', () => {
    const enc = makeService('key-A').encrypt('secret');
    expect(() => makeService('key-B').decrypt(enc)).toThrow();
  });
});
