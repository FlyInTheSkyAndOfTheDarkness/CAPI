import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 10),
        memberships: {
          create: {
            role: 'OWNER',
            workspace: { create: { name: dto.name ? `Воркспейс ${dto.name}` : 'Мой воркспейс' } },
          },
        },
      },
    });
    return this.issueToken(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.issueToken(user.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { id: 'asc' },
    });
    return {
      user,
      workspaces: memberships.map((m) => ({
        id: m.workspaceId,
        name: m.workspace.name,
        role: m.role,
      })),
    };
  }

  private async issueToken(userId: string) {
    return { token: await this.jwtService.signAsync({ sub: userId }) };
  }
}
