import { Module } from '@nestjs/common';
import { MaterialInventoryController } from './material-inventory.controller';
import { MaterialInventoryService } from './material-inventory.service';

@Module({
  controllers: [MaterialInventoryController],
  providers: [MaterialInventoryService],
  exports: [MaterialInventoryService],
})
export class MaterialInventoryModule {}
