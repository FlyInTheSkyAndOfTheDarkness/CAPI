import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LogsService, AnalyticsFilters } from './logs.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { WorkspaceScope } from '../common/decorators';
import { WorkspaceContext } from '../common/workspace-context';

@Controller('logs')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class LogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  list(
    @WorkspaceScope() scope: WorkspaceContext,
    @Query('status') status?: DeliveryStatus,
    @Query('connectionId') connectionId?: string,
    @Query('destinationId') destinationId?: string,
    @Query('eventName') eventName?: string,
    @Query('take') take?: string,
  ) {
    return this.prisma.deliveryLog.findMany({
      where: {
        workspaceId: scope.id,
        ...(status ? { status } : {}),
        ...(connectionId ? { connectionId } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(eventName ? { eventName } : {}),
        // Наблюдатель видит только логи назначенных маппингов
        ...(scope.mappingIds ? { mappingId: { in: scope.mappingIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }

  @Get('stats')
  stats(
    @WorkspaceScope() scope: WorkspaceContext,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.stats(scope.id, days, this.filters(query, scope));
  }

  @Get('breakdown')
  breakdown(
    @WorkspaceScope() scope: WorkspaceContext,
    @Query('by') by?: string,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    const dimension =
      by === 'connection' || by === 'event' || by === 'mapping' ? by : 'destination';
    return this.logsService.breakdown(scope.id, days, dimension, this.filters(query, scope));
  }

  @Get('analytics')
  analytics(
    @WorkspaceScope() scope: WorkspaceContext,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.analytics(scope.id, days, this.filters(query, scope));
  }

  @Get('errors')
  errors(
    @WorkspaceScope() scope: WorkspaceContext,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.errors(scope.id, days, this.filters(query, scope));
  }

  @Get('funnel')
  funnel(
    @WorkspaceScope() scope: WorkspaceContext,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.funnel(scope.id, days, this.filters(query, scope));
  }

  @Get('filters')
  filters_(@WorkspaceScope() scope: WorkspaceContext) {
    return this.logsService.filterOptions(scope.id, scope.mappingIds ?? undefined);
  }

  @Get('advisor')
  advisor(@WorkspaceScope() scope: WorkspaceContext) {
    // Советник считает здоровье всего воркспейса — наблюдателю недоступен
    if (scope.mappingIds) {
      throw new ForbiddenException('Советник недоступен для роли наблюдателя');
    }
    return this.logsService.advisor(scope.id);
  }

  /**
   * Собирает фильтры аналитики. Для наблюдателя (scope.mappingIds != null)
   * жёстко ограничивает выборку его набором маппингов — переопределить из
   * query это нельзя.
   */
  private filters(query: Record<string, string> | undefined, scope: WorkspaceContext): AnalyticsFilters {
    return {
      connectionId: query?.connectionId || undefined,
      destinationId: query?.destinationId || undefined,
      eventName: query?.eventName || undefined,
      ...(scope.mappingIds ? { mappingIds: scope.mappingIds } : {}),
    };
  }
}
