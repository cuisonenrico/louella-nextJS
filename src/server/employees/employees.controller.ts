import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  CreateRateDto,
  ListEmployeesQuery,
  SetSeparationDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';

type Actor = { id: number };

/**
 * Salaries live behind this controller, so it is closed at the class level —
 * a deliberate exception to the app's "reads are open" default.
 */
@Controller('employees')
@Roles(UserRole.ADMIN)
@RequireFeature('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  findAll(@Query() q: ListEmployeesQuery) {
    return this.employees.list(q);
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: Actor) {
    return this.employees.create(dto, user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employees.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: Actor) {
    return this.employees.update(id, dto, user.id);
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: SetSeparationDto, @CurrentUser() user: Actor) {
    return this.employees.setSeparation(id, dto.separatedOn, user.id);
  }

  @Get(':id/rates')
  listRates(@Param('id', ParseIntPipe) id: number) {
    return this.employees.listRates(id);
  }

  @Post(':id/rates')
  addRate(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateRateDto, @CurrentUser() user: Actor) {
    return this.employees.addRate(id, dto, user.id);
  }

  @Delete(':id/rates/:rateId')
  removeRate(
    @Param('id', ParseIntPipe) id: number,
    @Param('rateId', ParseIntPipe) rateId: number,
    @CurrentUser() user: Actor,
  ) {
    return this.employees.removeRate(id, rateId, user.id);
  }
}
