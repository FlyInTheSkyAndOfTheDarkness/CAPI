import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { Role, WorkspaceContext } from './workspace-context';

export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().userId;
});

export const WorkspaceId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().workspaceId!;
});

/** Полный контекст воркспейса (id + роль + ограничение по маппингам). */
export const WorkspaceScope = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorkspaceContext => {
    return ctx.switchToHttp().getRequest<AuthenticatedRequest>().workspace!;
  },
);

/** Ограничивает доступ к хендлеру/контроллеру перечисленными ролями (см. RolesGuard). */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
