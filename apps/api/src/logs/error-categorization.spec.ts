import { categorizeError } from './logs.service';

describe('categorizeError', () => {
  it('нет данных о клиенте', () => {
    const r = categorizeError('Meta CAPI: нет данных о клиенте (email/телефон/ID) для матчинга');
    expect(r.category).toBe('Нет email/телефона у контакта');
    expect(r.hint).toContain('email');
  });

  it('истёкший/неверный токен направления', () => {
    const r = categorizeError('Meta CAPI HTTP 400: Invalid OAuth access token - Cannot parse access token');
    expect(r.category).toBe('Неверный или истёкший токен направления');
  });

  it('токен amoCRM недействителен', () => {
    const r = categorizeError('amoCRM: не удалось обновить токен');
    expect(r.category).toBe('Токен amoCRM недействителен');
  });

  it('отклонено TikTok', () => {
    const r = categorizeError('TikTok Events API: code=40001 Invalid access token');
    expect(r.category).toBe('Отклонено TikTok');
  });

  it('отклонено Meta (без сетевых/oauth-маркеров)', () => {
    const r = categorizeError('Meta CAPI HTTP 500: Internal server error');
    // Строка содержит «Meta CAPI» — приоритетнее сетевой ветки
    expect(r.category).toBe('Отклонено Meta');
  });

  it('сетевая/временная ошибка', () => {
    const r = categorizeError('fetch failed: соединение сброшено');
    expect(r.category).toBe('Сеть или недоступность платформы');
  });

  it('неизвестная ошибка → прочая', () => {
    const r = categorizeError('что-то совсем непонятное');
    expect(r.category).toBe('Прочая ошибка');
  });
});
