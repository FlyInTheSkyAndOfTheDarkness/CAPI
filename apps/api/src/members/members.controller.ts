import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto, UpdateMemberDto } from './members.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceGuard } from '../common/workspace.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles, WorkspaceId } from '../common/decorators';

/** Управление наблюдателями — только для владельцев/админов воркспейса. */
@Controller('members')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string) {
    return this.members.list(workspaceId);
  }

  @Post()
  create(@WorkspaceId() workspaceId: string, @Body() dto: CreateMemberDto) {
    return this.members.create(workspaceId, dto);
  }

  @Patch(':id')
  update(
    @WorkspaceId() workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.members.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@WorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.members.remove(workspaceId, id);
  }
}
