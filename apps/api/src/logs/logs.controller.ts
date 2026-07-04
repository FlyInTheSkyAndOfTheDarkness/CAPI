import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LogsService, AnalyticsFilters } from './logs.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { WorkspaceId } from '../common/decorators';

@Controller('logs')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class LogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  @Get()
  list(
    @WorkspaceId() workspaceId: string,
    @Query('status') status?: DeliveryStatus,
    @Query('connectionId') connectionId?: string,
    @Query('destinationId') destinationId?: string,
    @Query('eventName') eventName?: string,
    @Query('take') take?: string,
  ) {
    return this.prisma.deliveryLog.findMany({
      where: {
        workspaceId,
        ...(status ? { status } : {}),
        ...(connectionId ? { connectionId } : {}),
        ...(destinationId ? { destinationId } : {}),
        ...(eventName ? { eventName } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(take) || 100, 500),
    });
  }

  @Get('stats')
  stats(
    @WorkspaceId() workspaceId: string,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.stats(workspaceId, days, this.filters(query));
  }

  @Get('breakdown')
  breakdown(
    @WorkspaceId() workspaceId: string,
    @Query('by') by?: string,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    const dimension =
      by === 'connection' || by === 'event' || by === 'mapping' ? by : 'destination';
    return this.logsService.breakdown(workspaceId, days, dimension, this.filters(query));
  }

  @Get('analytics')
  analytics(
    @WorkspaceId() workspaceId: string,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.analytics(workspaceId, days, this.filters(query));
  }

  @Get('errors')
  errors(
    @WorkspaceId() workspaceId: string,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.errors(workspaceId, days, this.filters(query));
  }

  @Get('funnel')
  funnel(
    @WorkspaceId() workspaceId: string,
    @Query('days') days?: string,
    @Query() query?: Record<string, string>,
  ) {
    return this.logsService.funnel(workspaceId, days, this.filters(query));
  }

  @Get('filters')
  filters_(@WorkspaceId() workspaceId: string) {
    return this.logsService.filterOptions(workspaceId);
  }

  @Get('advisor')
  advisor(@WorkspaceId() workspaceId: string) {
    return this.logsService.advisor(workspaceId);
  }

  private filters(query?: Record<string, string>): AnalyticsFilters {
    return {
      connectionId: query?.connectionId || undefined,
      destinationId: query?.destinationId || undefined,
      eventName: query?.eventName || undefined,
    };
  }
}
