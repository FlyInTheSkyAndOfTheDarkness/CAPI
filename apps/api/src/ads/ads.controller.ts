import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaInsightsService } from './meta-insights.service';
import { resolvePeriod } from '../logs/period';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles, WorkspaceId } from '../common/decorators';

/** Статистика рекламных кабинетов (Meta Marketing API). Наблюдателям недоступна. */
@Controller('ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@Roles('OWNER', 'ADMIN', 'MEMBER')
export class AdsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaInsights: MetaInsightsService,
  ) {}

  /** Кампании → группы → объявления с расходом и лидами за период. */
  @Get('meta')
  async meta(@WorkspaceId() workspaceId: string, @Query() query: Record<string, string>) {
    const destination = await this.ownedMeta(workspaceId, query?.destinationId);
    return this.metaInsights.insights(destination, resolvePeriod(query));
  }

  /** Диагностика доступа токена к статистике кабинета. */
  @Get('meta/check')
  async metaCheck(
    @WorkspaceId() workspaceId: string,
    @Query('destinationId') destinationId?: string,
  ) {
    const destination = await this.ownedMeta(workspaceId, destinationId);
    return this.metaInsights.check(destination);
  }

  private async ownedMeta(workspaceId: string, destinationId?: string) {
    if (!destinationId) {
      throw new BadRequestException('Не указано направление (destinationId)');
    }
    const destination = await this.prisma.destination.findFirst({
      where: { id: destinationId, workspaceId },
    });
    if (!destination) {
      throw new NotFoundException('Направление не найдено');
    }
    if (destination.type !== 'META') {
      throw new BadRequestException('Статистика кампаний доступна только для направлений Meta');
    }
    return destination;
  }
}
