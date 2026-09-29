import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { manilaToday } from '@/lib/manilaDate';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { HolidaysService } from './holidays.service';
import { PayrollSettingsService } from './payroll-settings.service';
import { CreateHolidayDto, CreateRestDayWorkDto, UpdateHolidayDto, UpdatePayrollSettingsDto } from './dto/holiday.dto';

type Actor = { id: number };

/** Holidays, rest-day marks and multipliers. Admin-only, reads included, like the rest of payroll. */
@Controller('payroll')
@Roles(UserRole.ADMIN)
@RequireFeature('payroll')
export class HolidaysController {
  constructor(
    private readonly holidays: HolidaysService,
    private readonly settings: PayrollSettingsService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdatePayrollSettingsDto, @CurrentUser() user: Actor) {
    return this.settings.update(dto, user.id);
  }

  @Get('holidays')
  list(@Query('year') year?: string) {
    return this.holidays.list(year ? Number(year) : Number(manilaToday().slice(0, 4)));
  }

  @Post('holidays')
  create(@Body() dto: CreateHolidayDto, @CurrentUser() user: Actor) {
    return this.holidays.create(dto, user.id);
  }

  @Patch('holidays/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHolidayDto, @CurrentUser() user: Actor) {
    return this.holidays.update(id, dto, user.id);
  }

  @Delete('holidays/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.holidays.remove(id, user.id);
  }

  @Post('holidays/:id/rest-day-work')
  addRestDayWork(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateRestDayWorkDto, @CurrentUser() user: Actor) {
    return this.holidays.addRestDayWork(id, dto, user.id);
  }

  @Delete('rest-day-work/:id')
  removeRestDayWork(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.holidays.removeRestDayWork(id, user.id);
  }
}
