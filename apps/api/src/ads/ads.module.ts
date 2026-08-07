import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto.module';
import { AdsController } from './ads.controller';
import { MetaInsightsService } from './meta-insights.service';

@Module({
  imports: [CryptoModule],
  controllers: [AdsController],
  providers: [MetaInsightsService],
})
export class AdsModule {}
