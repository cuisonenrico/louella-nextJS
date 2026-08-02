import { Module } from '@nestjs/common';
import { UnitConversionsController } from './unit-conversions.controller';
import { UnitConversionsService } from './unit-conversions.service';

@Module({
  controllers: [UnitConversionsController],
  providers: [UnitConversionsService],
  exports: [UnitConversionsService], // exported for use in RecipesService, cost calculators, etc.
})
export class UnitConversionsModule {}
