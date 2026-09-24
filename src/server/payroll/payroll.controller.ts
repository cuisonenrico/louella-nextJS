import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { currentCutoff } from '@/lib/payroll/cutoff';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollInputsService } from './payroll-inputs.service';
import { CreateAdjustmentDto, CreateSkipDto, VoidRunDto } from './dto/payroll.dto';
import { ParsePeriodStartPipe } from './dto/parse-period-start.pipe';

type Actor = { id: number };

/**
 * Admin-only at the class level. Payroll is the one area where reads are as
 * sensitive as writes, so the app's open-read default does not apply.
 */
@Controller('payroll')
@Roles(UserRole.ADMIN)
@RequireFeature('payroll')
export class PayrollController {
  constructor(
    private readonly runs: PayrollRunsService,
    private readonly inputs: PayrollInputsService,
  ) {}

  @Get('cutoffs')
  listCutoffs(@Query('year') year?: string) {
    return this.runs.listCutoffs(year ? Number(year) : Number(currentCutoff().periodStart.slice(0, 4)));
  }

  @Get('cutoffs/:periodStart')
  getCutoff(@Param('periodStart', ParsePeriodStartPipe) periodStart: string) {
    return this.runs.getCutoff(periodStart);
  }

  @Get('adjustments')
  listAdjustments(
    @Query('periodStart', ParsePeriodStartPipe) periodStart: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.inputs.listAdjustments(periodStart, employeeId ? Number(employeeId) : undefined);
  }

  @Post('adjustments')
  @Idempotent()
  createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: Actor) {
    return this.inputs.createAdjustment(dto, user.id);
  }

  @Delete('adjustments/:id')
  removeAdjustment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.inputs.removeAdjustment(id, user.id);
  }

  @Post('cutoffs/:periodStart/skips')
  createSkip(
    @Param('periodStart', ParsePeriodStartPipe) periodStart: string,
    @Body() dto: CreateSkipDto,
    @CurrentUser() user: Actor,
  ) {
    return this.inputs.createSkip(periodStart, dto, user.id);
  }

  @Delete('skips/:id')
  removeSkip(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.inputs.removeSkip(id, user.id);
  }

  @Post('cutoffs/:periodStart/finalize')
  @Idempotent()
  finalize(@Param('periodStart', ParsePeriodStartPipe) periodStart: string, @CurrentUser() user: Actor) {
    return this.runs.finalize(periodStart, user.id);
  }

  @Post('runs/:id/paid')
  markPaid(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.runs.markPaid(id, user.id);
  }

  @Post('runs/:id/void')
  voidRun(@Param('id', ParseIntPipe) id: number, @Body() dto: VoidRunDto, @CurrentUser() user: Actor) {
    return this.runs.voidRun(id, dto.reason, user.id);
  }

  @Get('runs/:id')
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.runs.getRun(id);
  }

  @Get('payslips/:id')
  getPayslip(@Param('id', ParseIntPipe) id: number) {
    return this.runs.getPayslip(id);
  }
}
