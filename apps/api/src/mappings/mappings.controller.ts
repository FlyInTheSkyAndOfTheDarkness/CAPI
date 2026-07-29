import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMappingDto, UpdateMappingDto } from './mappings.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles, WorkspaceId } from '../common/decorators';

@Controller('mappings')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
// Маппинги недоступны роли наблюдателя (VIEWER)
@Roles('OWNER', 'ADMIN', 'MEMBER')
export class MappingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.prisma.eventMapping.findMany({
      where: { workspaceId },
      include: {
        connection: { select: { id: true, name: true, type: true } },
        destination: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Создаёт маппинг. Если передан `statuses`, создаётся по маппингу на каждый
   * этап — так один этап остаётся отдельной строкой, которую можно выключить
   * или изменить независимо. Этапы, для которых такой же маппинг уже есть,
   * пропускаются: дубль означал бы двойную отправку конверсии в рекламный
   * кабинет. Возвращает список созданных маппингов.
   */
  @Post()
  async create(@WorkspaceId() workspaceId: string, @Body() dto: CreateMappingDto) {
    await this.assertOwnedRefs(workspaceId, dto.connectionId, dto.destinationId);

    const statuses = dto.statuses?.length
      ? dto.statuses
      : dto.statusId
        ? [{ id: dto.statusId, name: dto.statusName }]
        : [];
    if (statuses.length === 0) {
      throw new BadRequestException('Укажите хотя бы один этап воронки');
    }

    const pipelineId = dto.pipelineId || null;
    const base = {
      workspaceId,
      connectionId: dto.connectionId,
      destinationId: dto.destinationId,
      entityType: dto.entityType,
      pipelineId,
      pipelineName: dto.pipelineName || null,
      eventName: dto.eventName,
      sendValue: dto.sendValue ?? false,
      currency: dto.currency ?? 'RUB',
    };

    const existing = await this.prisma.eventMapping.findMany({
      where: {
        workspaceId,
        connectionId: dto.connectionId,
        destinationId: dto.destinationId,
        entityType: dto.entityType,
        pipelineId,
        eventName: dto.eventName,
        statusId: { in: statuses.map((s) => s.id) },
      },
      select: { statusId: true },
    });
    const taken = new Set(existing.map((m) => m.statusId));

    // Плюс дедуп внутри самого запроса — этап мог прийти дважды
    const fresh: typeof statuses = [];
    for (const s of statuses) {
      if (taken.has(s.id)) continue;
      taken.add(s.id);
      fresh.push(s);
    }

    await this.prisma.eventMapping.createMany({
      data: fresh.map((s) => ({ ...base, statusId: s.id, statusName: s.name || null })),
    });

    return this.prisma.eventMapping.findMany({
      where: {
        workspaceId,
        connectionId: dto.connectionId,
        destinationId: dto.destinationId,
        entityType: dto.entityType,
        pipelineId,
        eventName: dto.eventName,
        statusId: { in: fresh.map((s) => s.id) },
      },
      include: {
        connection: { select: { id: true, name: true, type: true } },
        destination: { select: { id: true, name: true, type: true } },
      },
    });
  }

  @Patch(':id')
  async update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMappingDto,
  ) {
    await this.getOwned(workspaceId, id);
    await this.assertOwnedRefs(workspaceId, dto.connectionId, dto.destinationId);
    const { pipelineId, pipelineName, statusName, ...rest } = dto;
    return this.prisma.eventMapping.update({
      where: { id },
      data: {
        ...rest,
        // Пустая строка = «сбросить»: пустая воронка означает «любая»
        ...(pipelineId !== undefined ? { pipelineId: pipelineId || null } : {}),
        ...(pipelineName !== undefined ? { pipelineName: pipelineName || null } : {}),
        ...(statusName !== undefined ? { statusName: statusName || null } : {}),
      },
      include: {
        connection: { select: { id: true, name: true, type: true } },
        destination: { select: { id: true, name: true, type: true } },
      },
    });
  }

  @Delete(':id')
  async remove(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    await this.getOwned(workspaceId, id);
    await this.prisma.eventMapping.delete({ where: { id } });
    return { ok: true };
  }

  /** Подключение и направление должны принадлежать этому воркспейсу. */
  private async assertOwnedRefs(
    workspaceId: string,
    connectionId?: string,
    destinationId?: string,
  ) {
    const [connection, destination] = await Promise.all([
      connectionId
        ? this.prisma.crmConnection.findFirst({ where: { id: connectionId, workspaceId } })
        : null,
      destinationId
        ? this.prisma.destination.findFirst({ where: { id: destinationId, workspaceId } })
        : null,
    ]);
    if ((connectionId && !connection) || (destinationId && !destination)) {
      throw new BadRequestException('Подключение или направление не найдено в воркспейсе');
    }
  }

  private async getOwned(workspaceId: string, id: string) {
    const mapping = await this.prisma.eventMapping.findFirst({ where: { id, workspaceId } });
    if (!mapping) {
      throw new NotFoundException('Маппинг не найден');
    }
    return mapping;
  }
}
