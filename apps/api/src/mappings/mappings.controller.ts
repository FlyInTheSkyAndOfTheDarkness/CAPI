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
import { WorkspaceId } from '../common/decorators';

@Controller('mappings')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
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

  @Post()
  async create(@WorkspaceId() workspaceId: string, @Body() dto: CreateMappingDto) {
    // Подключение и направление должны принадлежать этому воркспейсу
    const [connection, destination] = await Promise.all([
      this.prisma.crmConnection.findFirst({ where: { id: dto.connectionId, workspaceId } }),
      this.prisma.destination.findFirst({ where: { id: dto.destinationId, workspaceId } }),
    ]);
    if (!connection || !destination) {
      throw new BadRequestException('Подключение или направление не найдено в воркспейсе');
    }
    return this.prisma.eventMapping.create({
      data: { workspaceId, ...dto },
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
    return this.prisma.eventMapping.update({
      where: { id },
      data: dto,
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

  private async getOwned(workspaceId: string, id: string) {
    const mapping = await this.prisma.eventMapping.findFirst({ where: { id, workspaceId } });
    if (!mapping) {
      throw new NotFoundException('Маппинг не найден');
    }
    return mapping;
  }
}
