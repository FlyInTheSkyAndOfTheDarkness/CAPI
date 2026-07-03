import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { UserId } from '../common/decorators';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@UserId() userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { id: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.workspaceId,
      name: m.workspace.name,
      role: m.role,
    }));
  }
}
