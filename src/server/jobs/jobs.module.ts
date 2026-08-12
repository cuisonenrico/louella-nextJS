import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MaterialInventoryModule } from '../material-inventory/material-inventory.module';
import { AutofillOnDemandService } from './autofill-on-demand.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [PrismaModule, MaterialInventoryModule],
  providers: [JobsService, AutofillOnDemandService],
  controllers: [JobsController],
  // Exported for the globally-registered AutofillInterceptor (see AppModule).
  // Consumer modules do not import JobsModule — they only apply the metadata
  // decorator — which keeps MaterialInventoryModule out of an import cycle.
  exports: [AutofillOnDemandService],
})
export class JobsModule {}
