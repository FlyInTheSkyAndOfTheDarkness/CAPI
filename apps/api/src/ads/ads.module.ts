import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto.module';
import { AdsController } from './ads.controller';
import { MetaInsightsService } from './meta-insights.service';
import { MetaReportService } from './meta-report.service';

@Module({
  imports: [CryptoModule],
  controllers: [AdsController],
  providers: [MetaInsightsService, MetaReportService],
})
export class AdsModule {}
