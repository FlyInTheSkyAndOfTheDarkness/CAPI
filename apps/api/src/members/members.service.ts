import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto, UpdateMemberDto } from './members.dto';

const memberInclude = {
  user: { select: { id: true, email: true, name: true, createdAt: true } },
  mappingAccess: { select: { mappingId: true } },
} satisfies Prisma.WorkspaceMemberInclude;

type MemberWithRelations = Prisma.WorkspaceMemberGetPayload<{ include: typeof memberInclude }>;

/**
 * Управление наблюдателями воркспейса: владелец создаёт для людей аккаунты
 * (email + пароль) с доступом только к аналитике назначенных маппингов.
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(m: MemberWithRelations) {
    return {
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      mappingIds: m.mappingAccess.map((a) => a.mappingId),
      createdAt: m.user.createdAt,
    };
  }

  /** Проверяет, что все маппинги принадлежат воркспейсу. */
  private async assertMappingsInWorkspace(workspaceId: string, mappingIds: string[]) {
    const unique = [...new Set(mappingIds)];
    if (unique.length === 0) return;
    const count = await this.prisma.eventMapping.count({
      where: { workspaceId, id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('Некоторые маппинги не найдены в этом воркспейсе');
    }
  }

  /** Наблюдатели воркспейса. */
  async list(workspaceId: string) {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, role: 'VIEWER' },
      include: memberInclude,
      orderBy: { id: 'desc' },
    });
    return members.map((m) => this.toView(m));
  }

  async create(workspaceId: string, dto: CreateMemberDto) {
    await this.assertMappingsInWorkspace(workspaceId, dto.mappingIds);

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const member = await this.prisma.workspaceMember.create({
      data: {
        role: 'VIEWER',
        workspace: { connect: { id: workspaceId } },
        user: {
          create: {
            email: dto.email,
            name: dto.name,
            passwordHash: await bcrypt.hash(dto.password, 10),
          },
        },
        mappingAccess: {
          create: [...new Set(dto.mappingIds)].map((mappingId) => ({ mappingId })),
        },
      },
      include: memberInclude,
    });
    return this.toView(member);
  }

  private async getViewer(workspaceId: string, memberId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, role: 'VIEWER' },
      include: memberInclude,
    });
    if (!member) {
      throw new NotFoundException('Наблюдатель не найден');
    }
    return member;
  }

  async update(workspaceId: string, memberId: string, dto: UpdateMemberDto) {
    const member = await this.getViewer(workspaceId, memberId);

    // Профиль пользователя (имя/пароль)
    const userData: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) userData.name = dto.name;
    if (dto.password !== undefined) userData.passwordHash = await bcrypt.hash(dto.password, 10);
    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({ where: { id: member.userId }, data: userData });
    }

    // Полная замена набора доступных маппингов
    if (dto.mappingIds !== undefined) {
      await this.assertMappingsInWorkspace(workspaceId, dto.mappingIds);
      const unique = [...new Set(dto.mappingIds)];
      await this.prisma.$transaction([
        this.prisma.mappingAccess.deleteMany({ where: { memberId } }),
        this.prisma.mappingAccess.createMany({
          data: unique.map((mappingId) => ({ memberId, mappingId })),
        }),
      ]);
    }

    const fresh = await this.getViewer(workspaceId, memberId);
    return this.toView(fresh);
  }

  async remove(workspaceId: string, memberId: string) {
    const member = await this.getViewer(workspaceId, memberId);
    // Удаляем членство (mappingAccess снимется каскадом)
    await this.prisma.workspaceMember.delete({ where: { id: member.id } });
    // Если у пользователя не осталось воркспейсов — удаляем и сам аккаунт
    const remaining = await this.prisma.workspaceMember.count({ where: { userId: member.userId } });
    if (remaining === 0) {
      await this.prisma.user.delete({ where: { id: member.userId } });
    }
    return { ok: true };
  }
}
