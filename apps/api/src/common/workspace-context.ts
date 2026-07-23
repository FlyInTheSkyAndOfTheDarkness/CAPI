import { MemberRole } from '@prisma/client';

export type Role = MemberRole;

/**
 * Контекст доступа текущего запроса в рамках воркспейса. Заполняется
 * WorkspaceGuard после проверки членства.
 */
export interface WorkspaceContext {
  id: string;
  role: Role;
  /**
   * Ограничение видимости по маппингам: null — доступ ко всем маппингам
   * воркспейса (OWNER/ADMIN/MEMBER); массив id — только эти маппинги (VIEWER).
   * Пустой массив = наблюдателю не назначено ни одного маппинга (видит пусто).
   */
  mappingIds: string[] | null;
}
