import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { WorkspaceContext } from './workspace-context';

export interface AuthenticatedRequest extends Request {
  userId: string;
  workspaceId?: string;
  workspace?: WorkspaceContext;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Требуется авторизация');
    }
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(header.slice(7));
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }
  }
}
