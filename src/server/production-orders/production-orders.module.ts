import { Module } from '@nestjs/common';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';
import { SuggestionsService } from './suggestions.service';
import { ProductionModule } from '../production/production.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [ProductionModule, InventoryModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService, SuggestionsService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
