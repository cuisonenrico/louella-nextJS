import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  // Branch cash reads the day's sales from here, so the figure always matches
  // the sales page.
  exports: [SalesService],
})
export class SalesModule {}
