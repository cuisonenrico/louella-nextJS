import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { ProductionAnalyticsService } from './production-analytics.service';

@Module({
  controllers: [ProductionController],
  providers: [ProductionService, ProductionAnalyticsService],
  exports: [ProductionService],
})
export class ProductionModule {}
