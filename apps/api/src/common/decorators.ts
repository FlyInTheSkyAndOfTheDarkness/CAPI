import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './jwt-auth.guard';

export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().userId;
});

export const WorkspaceId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().workspaceId!;
});
