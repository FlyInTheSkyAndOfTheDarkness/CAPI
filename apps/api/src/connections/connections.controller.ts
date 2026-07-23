import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, UpdateConnectionDto } from './connections.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles, WorkspaceId } from '../common/decorators';

@Controller('connections')
// Настройки подключений недоступны роли наблюдателя (VIEWER)
@Roles('OWNER', 'ADMIN', 'MEMBER')
export class ConnectionsController {
  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly config: ConfigService,
  ) {}

  // --- Публичный OAuth-колбэк amoCRM (без авторизации) ---
  @Get('amocrm/callback')
  async amocrmCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('referer') referer: string | undefined,
    @Res() res: Response,
  ) {
    const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
    try {
      await this.connectionsService.handleAmocrmCallback(code, state, referer);
      return res.redirect(`${webOrigin}/connections?oauth=success`);
    } catch {
      return res.redirect(`${webOrigin}/connections?oauth=error`);
    }
  }

  // Redirect URI постоянен и нужен до создания подключения (для настройки интеграции amoCRM)
  @Get('amocrm/redirect-uri')
  amocrmRedirectUri() {
    return { redirectUri: this.connectionsService.amocrmRedirectUri() };
  }

  // --- Защищённые эндпоинты ---
  @Get()
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  list(@WorkspaceId() workspaceId: string) {
    return this.connectionsService.list(workspaceId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  create(@WorkspaceId() workspaceId: string, @Body() dto: CreateConnectionDto) {
    return this.connectionsService.create(workspaceId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.connectionsService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  remove(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.connectionsService.remove(workspaceId, id);
  }

  @Post(':id/test')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  test(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.connectionsService.test(workspaceId, id);
  }

  @Get(':id/amocrm/oauth-url')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  amocrmOauthUrl(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.connectionsService.getAmocrmAuthorizeUrl(workspaceId, id);
  }

  @Get(':id/pipelines')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  pipelines(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.connectionsService.getPipelines(workspaceId, id);
  }

  @Post(':id/amocrm/webhook')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  subscribeWebhook(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.connectionsService.ensureAmocrmWebhook(workspaceId, id);
  }

  @Get(':id/diagnostics')
  @UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
  diagnostics(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.connectionsService.diagnostics(workspaceId, id);
  }
}
