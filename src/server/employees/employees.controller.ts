import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { EmployeesService } from './employees.service';
import { EmployeeAccountsService } from './employee-accounts.service';
import { CreateEmployeeAccountDto, LinkEmployeeAccountDto } from './dto/account.dto';
import { RecurringDeductionsService } from './recurring-deductions.service';
import { CreateRecurringDeductionDto, UpdateRecurringDeductionDto } from './dto/recurring-deduction.dto';
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
  constructor(
    private readonly employees: EmployeesService,
    private readonly deductions: RecurringDeductionsService,
    private readonly accounts: EmployeeAccountsService,
  ) {}

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

  @Get(':id/recurring-deductions')
  listDeductions(@Param('id', ParseIntPipe) id: number) {
    return this.deductions.list(id);
  }

  @Post(':id/recurring-deductions')
  addDeduction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRecurringDeductionDto,
    @CurrentUser() user: Actor,
  ) {
    return this.deductions.create(id, dto, user.id);
  }

  @Patch(':id/recurring-deductions/:dedId')
  updateDeduction(
    @Param('id', ParseIntPipe) id: number,
    @Param('dedId', ParseIntPipe) dedId: number,
    @Body() dto: UpdateRecurringDeductionDto,
    @CurrentUser() user: Actor,
  ) {
    return this.deductions.update(id, dedId, dto, user.id);
  }

  @Post(':id/account')
  createAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmployeeAccountDto,
    @CurrentUser() user: Actor,
  ) {
    return this.accounts.create(id, dto, user.id);
  }

  @Post(':id/account/link')
  linkAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkEmployeeAccountDto,
    @CurrentUser() user: Actor,
  ) {
    return this.accounts.link(id, dto.userId, user.id);
  }

  @Delete(':id/account')
  deactivateAccount(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.accounts.deactivate(id, user.id);
  }
}
