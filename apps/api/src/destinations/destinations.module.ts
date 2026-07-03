import { Module } from '@nestjs/common';
import { DestinationsController } from './destinations.controller';
import { DestinationsService } from './destinations.service';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [DeliveryModule],
  controllers: [DestinationsController],
  providers: [DestinationsService],
})
export class DestinationsModule {}
