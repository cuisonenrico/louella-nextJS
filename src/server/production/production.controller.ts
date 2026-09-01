import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProductionService } from './production.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { UpdateProductionDto } from './dto/update-production.dto';
import { ProductionDateQueryDto } from './dto/production-date-query.dto';
import { ProductionDateRangeQueryDto } from './dto/production-date-range-query.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Autofill } from '../common/decorators/autofill.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BranchGuard } from '../common/guards/branch.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('production')
// The production-cost and production-efficiency SCREENS have their own keys and
// are gated client-side; their underlying data is served from here under
// 'production', so enabling either page does not require a second grant.
@RequireFeature('production')
@Roles(UserRole.VIEWER)
@UseGuards(RolesGuard, BranchGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Post()
  @RequireFeature('production:create')
  @Roles(UserRole.MANAGER)
  create(
    @Body() body: CreateProductionDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.productionService.create(body, user?.id);
  }

  @Post('bulk')
  @RequireFeature('production:create')
  @Roles(UserRole.MANAGER)
  createBulk(
    @Body(new ParseArrayPipe({ items: CreateProductionDto }))
    body: CreateProductionDto[],
    @CurrentUser() user: { id: number },
  ) {
    return this.productionService.createBulk(body, user?.id);
  }

  @Post('upsert-bulk')
  @RequireFeature('production:create')
  @Roles(UserRole.MANAGER)
  upsertBulk(
    @Body()
    body: Array<{
      productId: number;
      date: string;
      yield: number;
      branchId?: number;
    }>,
    @CurrentUser() user: { id: number },
  ) {
    return this.productionService.upsertBulk(body, user?.id);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.productionService.findAll(
      page,
      limit,
      parseBranchScope(branchIdStr),
    );
  }

  @Get('branch/:branchId')
  findByBranch(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.productionService.findByBranch(branchId, page, limit);
  }

  @Get('product/:productId')
  findByProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.productionService.findByProduct(
      productId,
      page,
      limit,
      parseBranchScope(branchIdStr),
    );
  }

  // The production sheet. Shares the 'inventory' scope because one job creates
  // both the Inventory and Production placeholder rows for a date.
  @Autofill('inventory')
  @Get('date')
  findByDateAllBranches(
    @Query() query: ProductionDateRangeQueryDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    const branchId = branchIdStr ? parseInt(branchIdStr, 10) : undefined;
    return this.productionService.findByDateAllBranches(
      query.startDate,
      query.endDate,
      branchId,
    );
  }

  @Autofill('inventory')
  @Get('branch/:branchId/date')
  findByDate(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query() query: ProductionDateQueryDto,
  ) {
    return this.productionService.findByDate(branchId, query.date);
  }

  @Get('material-consumption/summary')
  // Serves a screen with its own key, which is off by default. Accepting that
  // key means enabling the page is a single grant rather than two.
  @RequireFeature('production', 'production-cost')
  getConsumptionSummary(
    @Query('date') date: string,
    @Query('branchId') branchIdStr?: string,
  ) {
    const branchId = branchIdStr ? parseInt(branchIdStr, 10) : undefined;
    return this.productionService.getMaterialConsumptionSummary(date, branchId);
  }

  @Get('efficiency')
  // Serves a screen with its own key, which is off by default. Accepting that
  // key means enabling the page is a single grant rather than two.
  @RequireFeature('production', 'production-efficiency')
  getEfficiency(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('branchId') branchIdStr?: string,
  ) {
    const branchId = branchIdStr ? parseInt(branchIdStr, 10) : undefined;
    return this.productionService.getEfficiency(startDate, endDate, branchId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.productionService.findOne(id, parseBranchScope(branchIdStr));
  }

  @Get(':id/material-consumption')
  getMaterialConsumption(
    @Param('id', ParseIntPipe) id: number,
    @Query('plannedYield') plannedYieldStr?: string,
  ) {
    const plannedYield = plannedYieldStr
      ? parseInt(plannedYieldStr, 10)
      : undefined;
    return this.productionService.getMaterialConsumption(id, plannedYield);
  }

  @Patch(':id')
  @RequireFeature('production:edit')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProductionDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.productionService.update(
      id,
      body,
      parseBranchScope(branchIdStr),
    );
  }

  @Delete(':id')
  @RequireFeature('production:delete')
  @Roles(UserRole.MANAGER)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.productionService.remove(id, parseBranchScope(branchIdStr));
  }
}

/**
 * Resolve the effective branch scope. For MANAGER users the BranchGuard has
 * already injected their own branchId into the query; for other roles this is
 * the optional requested filter.
 */
function parseBranchScope(raw?: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
