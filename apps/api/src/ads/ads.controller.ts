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
import { META_GRANULARITIES, META_LEVELS, MetaGranularity, MetaLevel, MetaReportService, parseIds } from './meta-report.service';
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
    private readonly metaReport: MetaReportService,
  ) {}

  /** Кампании → группы → объявления с расходом и лидами за период. */
  @Get('meta')
  async meta(@WorkspaceId() workspaceId: string, @Query() query: Record<string, string>) {
    const destination = await this.ownedMeta(workspaceId, query?.destinationId);
    return this.metaInsights.insights(destination, resolvePeriod(query));
  }

  /** Ads Manager: таблица уровня (кампании / группы / объявления) за период. */
  @Get('meta/report')
  async report(@WorkspaceId() workspaceId: string, @Query() query: Record<string, string>) {
    const destination = await this.ownedMeta(workspaceId, query?.destinationId);
    return this.metaReport.report(destination, this.level(query?.level), resolvePeriod(query), {
      campaignIds: parseIds(query?.campaignIds),
      adsetIds: parseIds(query?.adsetIds),
    });
  }

  /** Ads Manager: разбивка по дням для кабинета или одного объекта (level + id). */
  @Get('meta/daily')
  async daily(@WorkspaceId() workspaceId: string, @Query() query: Record<string, string>) {
    const destination = await this.ownedMeta(workspaceId, query?.destinationId);
    const id = parseIds(query?.id)?.[0];
    if (query?.id && !id) throw new BadRequestException('Некорректный ID объекта Meta');
    return this.metaReport.daily(
      destination,
      resolvePeriod(query),
      id ? { level: this.level(query?.level), id } : undefined,
      this.granularity(query?.granularity),
    );
  }

  private granularity(value?: string): MetaGranularity {
    if (!value) return 'day';
    if (!META_GRANULARITIES.includes(value as MetaGranularity)) {
      throw new BadRequestException('granularity: day, week или month');
    }
    return value as MetaGranularity;
  }

  private level(value?: string): MetaLevel {
    if (!value) return 'campaign';
    if (!META_LEVELS.includes(value as MetaLevel)) {
      throw new BadRequestException('level: campaign, adset или ad');
    }
    return value as MetaLevel;
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
