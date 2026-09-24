import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BranchGuard } from '../common/guards/branch.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { BranchCashDaysService } from './branch-cash-days.service';
import { BranchCashEntriesService } from './branch-cash-entries.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import {
  CashDayRefDto,
  CreateCategoryDto,
  CreateExpenseDto,
  CreateValeDto,
  DayQueryDto,
  SetActualCashDto,
  SummaryQueryDto,
  UpdateCategoryDto,
  UpdateExpenseDto,
  UpdateValeDto,
} from './dto/branch-cash.dto';

type Actor = { id: number };

/**
 * The scoped branch for an `:id` route. For a branch-confined user BranchGuard
 * has pinned their own branch into the query, so a row from another branch is
 * simply not found (404) — never a 403 that confirms the id exists.
 */
function parseBranchId(raw?: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

@Controller('branch-cash')
@UseGuards(BranchGuard)
@RequireFeature('branch-cash')
@ApiTags('branch-cash')
@ApiBearerAuth()
export class BranchCashController {
  constructor(
    private readonly days: BranchCashDaysService,
    private readonly entries: BranchCashEntriesService,
    private readonly categories: ExpenseCategoriesService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  @Get('day')
  getDay(@Query() q: DayQueryDto) {
    return this.days.getDay(q.branchId, q.date);
  }

  @Get('summary')
  summary(@Query() q: SummaryQueryDto) {
    return this.days.summary({ from: q.from, to: q.to, branchId: q.branchId, unverified: q.unverified === 'true' });
  }

  @Get('employees')
  employees(@Query() q: DayQueryDto) {
    return this.days.employeesFor(q.branchId, q.date);
  }

  @Get('categories')
  listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.categories.list(includeInactive === 'true');
  }

  // ── Categories (admin) ─────────────────────────────────────────────────────

  @Post('categories')
  @RequireFeature('branch-cash:categories')
  @Roles(UserRole.ADMIN)
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: Actor) {
    return this.categories.create(dto, user.id);
  }

  @Patch('categories/:id')
  @RequireFeature('branch-cash:categories')
  @Roles(UserRole.ADMIN)
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto, @CurrentUser() user: Actor) {
    return this.categories.update(id, dto, user.id);
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  @Post('expenses')
  @Idempotent()
  @RequireFeature('branch-cash:create')
  @Roles(UserRole.MANAGER)
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: Actor) {
    return this.entries.createExpense(dto, user.id);
  }

  @Patch('expenses/:id')
  @RequireFeature('branch-cash:edit')
  @Roles(UserRole.MANAGER)
  updateExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: Actor,
    @Query('branchId') branchId?: string,
  ) {
    return this.entries.updateExpense(id, dto, parseBranchId(branchId), user.id);
  }

  @Delete('expenses/:id')
  @RequireFeature('branch-cash:delete')
  @Roles(UserRole.MANAGER)
  voidExpense(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor, @Query('branchId') branchId?: string) {
    return this.entries.voidExpense(id, parseBranchId(branchId), user.id);
  }

  // ── Vale ───────────────────────────────────────────────────────────────────

  @Post('vale')
  @Idempotent()
  @RequireFeature('branch-cash:create')
  @Roles(UserRole.MANAGER)
  createVale(@Body() dto: CreateValeDto, @CurrentUser() user: Actor) {
    return this.entries.createVale(dto, user.id);
  }

  @Patch('vale/:id')
  @RequireFeature('branch-cash:edit')
  @Roles(UserRole.MANAGER)
  updateVale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateValeDto,
    @CurrentUser() user: Actor,
    @Query('branchId') branchId?: string,
  ) {
    return this.entries.updateVale(id, dto, parseBranchId(branchId), user.id);
  }

  @Delete('vale/:id')
  @RequireFeature('branch-cash:delete')
  @Roles(UserRole.MANAGER)
  voidVale(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor, @Query('branchId') branchId?: string) {
    return this.entries.voidVale(id, parseBranchId(branchId), user.id);
  }

  // ── The day ────────────────────────────────────────────────────────────────

  @Put('day/actual-cash')
  @RequireFeature('branch-cash:create')
  @Roles(UserRole.MANAGER)
  setActualCash(@Body() dto: SetActualCashDto, @CurrentUser() user: Actor) {
    return this.entries.setActualCash(dto, user.id);
  }

  @Post('day/verify')
  @RequireFeature('branch-cash:verify')
  @Roles(UserRole.ADMIN)
  verify(@Body() dto: CashDayRefDto, @CurrentUser() user: Actor) {
    return this.days.verify(dto.branchId, dto.date, user.id);
  }

  @Post('day/reopen')
  @RequireFeature('branch-cash:verify')
  @Roles(UserRole.ADMIN)
  reopen(@Body() dto: CashDayRefDto, @CurrentUser() user: Actor) {
    return this.days.reopen(dto.branchId, dto.date, user.id);
  }
}
