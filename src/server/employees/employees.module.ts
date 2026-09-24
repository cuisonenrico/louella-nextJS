import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmployeesController } from './employees.controller';
import { JobRolesController } from './job-roles.controller';
import { EmployeesService } from './employees.service';
import { JobRolesService } from './job-roles.service';

@Module({
  imports: [UsersModule],
  controllers: [EmployeesController, JobRolesController],
  providers: [EmployeesService, JobRolesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
