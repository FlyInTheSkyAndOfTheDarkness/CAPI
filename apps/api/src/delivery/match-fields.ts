/**
 * Извлечение click-id и доп. полей клиента из произвольных полей CRM.
 * Click-id/utm обычно кладутся формой сайта в кастомные поля лида
 * (fbclid/gclid/ttclid/yclid), доп. поля (город/страна/индекс/имя) — в контакте.
 * Совпадение ищем по явному маппингу (connection.fieldMap) или авто-детектом
 * по имени/коду поля.
 */

export type MatchKey =
  | 'fbclid'
  | 'fbp'
  | 'ttclid'
  | 'gclid'
  | 'yclid'
  | 'city'
  | 'country'
  | 'zip'
  | 'firstName'
  | 'lastName';

// Ключевые слова для авто-детекта (lowercase, подстрока в имени/коде поля)
const KEYWORDS: Record<MatchKey, string[]> = {
  fbclid: ['fbclid', 'fbc', 'facebook_click'],
  fbp: ['fbp', '_fbp'],
  ttclid: ['ttclid', 'tt_clid', 'tiktok_click'],
  gclid: ['gclid', 'google_click'],
  yclid: ['yclid', 'ym_uid'],
  city: ['city', 'город'],
  country: ['country', 'страна'],
  zip: ['zip', 'postal', 'индекс', 'почтовый'],
  firstName: ['first_name', 'firstname', 'имя'],
  lastName: ['last_name', 'lastname', 'фамилия'],
};

export interface RawField {
  name?: string | null;
  code?: string | null;
  value?: string | number | null;
}

export type MatchFields = Partial<Record<MatchKey, string>>;

function fieldValue(f: RawField): string | undefined {
  if (f.value == null) return undefined;
  const s = String(f.value).trim();
  return s === '' ? undefined : s;
}

/**
 * @param fields   плоский список полей CRM {name, code, value}
 * @param fieldMap явный маппинг ключ→имя/код поля CRM (переопределяет авто-детект)
 * @param keys     какие ключи искать (по умолчанию все)
 */
export function extractMatchFields(
  fields: RawField[],
  fieldMap?: Record<string, string> | null,
  keys: MatchKey[] = Object.keys(KEYWORDS) as MatchKey[],
): MatchFields {
  const out: MatchFields = {};
  for (const key of keys) {
    // 1) Явный маппинг по точному имени/коду поля
    const mapped = fieldMap?.[key];
    if (mapped) {
      const m = mapped.toLowerCase();
      const f = fields.find(
        (x) => (x.name ?? '').toLowerCase() === m || (x.code ?? '').toLowerCase() === m,
      );
      const v = f && fieldValue(f);
      if (v) {
        out[key] = v;
        continue;
      }
    }
    // 2) Авто-детект по ключевым словам
    const kws = KEYWORDS[key];
    const f = fields.find((x) => {
      const n = (x.name ?? '').toLowerCase();
      const c = (x.code ?? '').toLowerCase();
      return kws.some((kw) => n.includes(kw) || c.includes(kw));
    });
    const v = f && fieldValue(f);
    if (v) out[key] = v;
  }
  return out;
}

export const CLICK_ID_KEYS: MatchKey[] = ['fbclid', 'fbp', 'ttclid', 'gclid', 'yclid'];
export const PERSON_KEYS: MatchKey[] = ['city', 'country', 'zip', 'firstName', 'lastName'];
