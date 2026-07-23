import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { ROLES_KEY } from './decorators';
import { Role } from './workspace-context';

/**
 * Проверяет роль участника воркспейса против списка из @Roles(...).
 * Ставится ПОСЛЕ WorkspaceGuard (использует req.workspace.role).
 * Если @Roles не задан — доступ открыт для всех участников.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = req.workspace?.role;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
    return true;
  }
}
