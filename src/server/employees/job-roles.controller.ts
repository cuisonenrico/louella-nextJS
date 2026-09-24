import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { JobRolesService } from './job-roles.service';
import { CreateJobRoleDto, UpdateJobRoleDto } from './dto/job-role.dto';

@Controller('job-roles')
@Roles(UserRole.ADMIN)
@RequireFeature('employees')
export class JobRolesController {
  constructor(private readonly jobRoles: JobRolesService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.jobRoles.list(includeInactive === 'true');
  }

  @Post()
  create(@Body() dto: CreateJobRoleDto) {
    return this.jobRoles.create(dto.name);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobRoleDto) {
    return this.jobRoles.update(id, dto);
  }
}
