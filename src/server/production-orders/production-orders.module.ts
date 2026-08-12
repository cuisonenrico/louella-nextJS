import { Module } from '@nestjs/common';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';
import { SuggestionsService } from './suggestions.service';

@Module({
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService, SuggestionsService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
