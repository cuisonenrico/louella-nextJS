import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryWorkbookService } from './inventory-workbook.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryWorkbookService],
  exports: [InventoryService],
})
export class InventoryModule {}
