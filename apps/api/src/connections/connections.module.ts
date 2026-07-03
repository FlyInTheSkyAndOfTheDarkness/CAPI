import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { AmocrmService } from './amocrm.service';
import { Bitrix24Service } from './bitrix24.service';

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, AmocrmService, Bitrix24Service],
  exports: [AmocrmService, Bitrix24Service],
})
export class ConnectionsModule {}
