import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollDraftService } from './payroll-draft.service';
import { PayrollInputsService } from './payroll-inputs.service';
import { PayrollRunsService } from './payroll-runs.service';

@Module({
  controllers: [PayrollController],
  providers: [PayrollDraftService, PayrollInputsService, PayrollRunsService],
})
export class PayrollModule {}
