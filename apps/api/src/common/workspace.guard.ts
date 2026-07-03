import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Разрешает доступ к ресурсам воркспейса. Воркспейс берётся из заголовка
 * X-Workspace-Id (или первый воркспейс пользователя, если заголовок не передан)
 * и проверяется членство. Ставится после JwtAuthGuard.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const requestedId = req.headers['x-workspace-id'] as string | undefined;

    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: req.userId, ...(requestedId ? { workspaceId: requestedId } : {}) },
      orderBy: { id: 'asc' },
    });
    if (!membership) {
      throw new ForbiddenException('Нет доступа к воркспейсу');
    }
    req.workspaceId = membership.workspaceId;
    return true;
  }
}
