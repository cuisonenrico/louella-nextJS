import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialAdjustmentsController } from './material-adjustments.controller';
import { MaterialAdjustmentsService } from './material-adjustments.service';

@Module({
  imports: [PrismaModule],
  controllers: [MaterialAdjustmentsController],
  providers: [MaterialAdjustmentsService],
})
export class MaterialAdjustmentsModule {}
