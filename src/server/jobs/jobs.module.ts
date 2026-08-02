import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialInventoryModule } from '../material-inventory/material-inventory.module';
import { CronController } from './cron.controller';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PrismaModule, MaterialInventoryModule],
  providers: [JobsService],
  controllers: [JobsController, CronController],
})
export class JobsModule {}
