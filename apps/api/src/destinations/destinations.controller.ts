import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DestinationsService } from './destinations.service';
import { CreateDestinationDto, UpdateDestinationDto } from './destinations.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles, WorkspaceId } from '../common/decorators';

@Controller('destinations')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
// Настройки направлений недоступны роли наблюдателя (VIEWER)
@Roles('OWNER', 'ADMIN', 'MEMBER')
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.destinationsService.list(workspaceId);
  }

  @Post()
  create(@WorkspaceId() workspaceId: string, @Body() dto: CreateDestinationDto) {
    return this.destinationsService.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDestinationDto,
  ) {
    return this.destinationsService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.destinationsService.remove(workspaceId, id);
  }

  @Post(':id/test')
  test(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.destinationsService.sendTestEvent(workspaceId, id);
  }
}
