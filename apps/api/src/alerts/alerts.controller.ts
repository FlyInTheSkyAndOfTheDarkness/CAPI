import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AlertsService, UpdateAlertsDto } from './alerts.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles, WorkspaceId } from '../common/decorators';

@Controller('alerts')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
// Настройки уведомлений недоступны роли наблюдателя (VIEWER)
@Roles('OWNER', 'ADMIN', 'MEMBER')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  get(@WorkspaceId() workspaceId: string) {
    return this.alerts.getSettings(workspaceId);
  }

  @Put()
  update(@WorkspaceId() workspaceId: string, @Body() dto: UpdateAlertsDto) {
    return this.alerts.updateSettings(workspaceId, dto);
  }

  @Post('test')
  test(@WorkspaceId() workspaceId: string) {
    return this.alerts.testAlert(workspaceId);
  }
}
