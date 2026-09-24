import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmployeesController } from './employees.controller';
import { JobRolesController } from './job-roles.controller';
import { EmployeesService } from './employees.service';
import { JobRolesService } from './job-roles.service';
import { AbsencesController } from './absences.controller';
import { RecurringDeductionsService } from './recurring-deductions.service';
import { AbsencesService } from './absences.service';

@Module({
  imports: [UsersModule],
  controllers: [EmployeesController, JobRolesController, AbsencesController],
  providers: [EmployeesService, JobRolesService, RecurringDeductionsService, AbsencesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
