import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InventoryImportController } from './inventory-import.controller';
import { InventoryImportService } from './inventory-import.service';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [InventoryImportController],
  providers: [InventoryImportService],
})
export class InventoryImportModule {}
