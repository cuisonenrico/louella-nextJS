import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmployeesController } from './employees.controller';
import { JobRolesController } from './job-roles.controller';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { EmployeesService } from './employees.service';
import { JobRolesService } from './job-roles.service';
import { AbsencesController } from './absences.controller';
import { RecurringDeductionsService } from './recurring-deductions.service';
import { AbsencesService } from './absences.service';
import { EmployeeAccountsService } from './employee-accounts.service';

@Module({
  imports: [UsersModule],
  controllers: [EmployeesController, JobRolesController, CompaniesController, AbsencesController],
  providers: [EmployeesService, JobRolesService, CompaniesService, RecurringDeductionsService, AbsencesService, EmployeeAccountsService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
