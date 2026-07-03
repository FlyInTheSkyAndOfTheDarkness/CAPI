import { Module } from '@nestjs/common';
import { MappingsController } from './mappings.controller';

@Module({
  controllers: [MappingsController],
})
export class MappingsModule {}
