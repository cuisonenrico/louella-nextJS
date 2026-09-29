import { Module } from '@nestjs/common';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { PayrollController } from './payroll.controller';
import { PayrollDraftService } from './payroll-draft.service';
import { PayrollInputsService } from './payroll-inputs.service';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollSettingsService } from './payroll-settings.service';

@Module({
  controllers: [PayrollController, HolidaysController],
  providers: [PayrollDraftService, PayrollInputsService, PayrollRunsService, HolidaysService, PayrollSettingsService],
})
export class PayrollModule {}
