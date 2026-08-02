import {
  BadRequestException,
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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryDateQueryDto } from './dto/inventory-date-query.dto';
import { InventoryDateRangeQueryDto } from './dto/inventory-date-range-query.dto';
import { InventorySummaryQueryDto } from './dto/inventory-summary-query.dto';
import {
  InventoryDashboardQueryDto,
  RejectionQueryDto,
} from './dto/inventory-dashboard-query.dto';
import { InventoryGapsQueryDto } from './dto/inventory-gaps-query.dto';
import { RecascadeDto } from './dto/recascade.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BranchGuard } from '../common/guards/branch.guard';

@Controller('inventory')
@Roles(UserRole.VIEWER)
@UseGuards(RolesGuard, BranchGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles(UserRole.INVENTORY)
  create(
    @Body() body: CreateInventoryDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.inventoryService.create(body, user?.id);
  }

  @Post('bulk')
  @Roles(UserRole.INVENTORY)
  createBulk(
    @Body(new ParseArrayPipe({ items: CreateInventoryDto }))
    body: CreateInventoryDto[],
    @CurrentUser() user: { id: number },
  ) {
    return this.inventoryService.createBulk(body, user?.id);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.inventoryService.findAll(
      page,
      limit,
      parseBranchId(branchIdStr),
    );
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.inventoryService.search(
      q ?? '',
      page,
      limit,
      parseBranchId(branchIdStr),
    );
  }

  @Get('branch/:branchId')
  findByBranch(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.inventoryService.findByBranch(branchId, page, limit);
  }

  @Get('product/:productId')
  findByProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.inventoryService.findByProduct(
      productId,
      page,
      limit,
      parseBranchId(branchIdStr),
    );
  }

  @Get('date')
  findByDateAllBranches(
    @Query() query: InventoryDateRangeQueryDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    const branchId = branchIdStr ? parseInt(branchIdStr, 10) : undefined;
    return this.inventoryService.findByDateAllBranches(
      query.startDate,
      query.endDate,
      branchId,
    );
  }

  @Get('branch/:branchId/date')
  findByDate(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query() query: InventoryDateQueryDto,
  ) {
    return this.inventoryService.findByDate(branchId, query.date);
  }

  @Get('branch/:branchId/date-range')
  findByBranchDateRange(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query() query: InventoryDateRangeQueryDto,
  ) {
    const startDate = query.startDate ?? query.endDate;
    if (!startDate) {
      throw new BadRequestException('startDate or endDate is required');
    }
    return this.inventoryService.findByBranchDateRange(
      branchId,
      startDate,
      query.endDate,
    );
  }

  @Get('dashboard')
  getDashboard(@Query() query: InventoryDashboardQueryDto) {
    const branchId = query.branchId ? parseInt(query.branchId, 10) : null;
    return this.inventoryService.getDashboard(
      branchId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('summary')
  getSummary(@Query() query: InventorySummaryQueryDto) {
    const branchId = query.branchId ? parseInt(query.branchId, 10) : null;
    return this.inventoryService.getSummary(
      branchId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('export-sales')
  async exportSales(
    @Query() query: InventoryDashboardQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const branchId = query.branchId ? parseInt(query.branchId, 10) : null;
    const csv = await this.inventoryService.exportSalesCsv(
      branchId,
      query.startDate,
      query.endDate,
    );
    const start = query.startDate ?? 'all';
    const end = query.endDate ?? 'all';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report-${start}-to-${end}.csv"`,
    );
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get('gaps')
  getGaps(@Query() query: InventoryGapsQueryDto) {
    const branchId = query.branchId ? parseInt(query.branchId, 10) : null;
    return this.inventoryService.getGaps(
      branchId,
      query.startDate,
      query.endDate,
    );
  }

  @Post('recascade')
  @Roles(UserRole.INVENTORY)
  recascade(@Body() body: RecascadeDto) {
    return this.inventoryService.recascadeLeftovers(
      body.branchId,
      body.productId,
      body.fromDate,
    );
  }

  @Get('rejection-by-product')
  getRejectionByProduct(@Query() query: RejectionQueryDto) {
    const branchId = query.branchId ? parseInt(query.branchId, 10) : null;
    return this.inventoryService.getRejectionByProduct(
      branchId,
      query.startDate,
      query.endDate,
      query.type,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.inventoryService.findOne(id, parseBranchId(branchIdStr));
  }

  @Patch(':id')
  @Roles(UserRole.INVENTORY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateInventoryDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.inventoryService.update(id, body, parseBranchId(branchIdStr));
  }

  @Delete(':id')
  @Roles(UserRole.INVENTORY)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchIdStr?: string,
  ) {
    return this.inventoryService.remove(id, parseBranchId(branchIdStr));
  }
}

/**
 * Resolve the effective branch scope from the request. For MANAGER users the
 * BranchGuard has already injected their own branchId into the query, so this
 * value is authoritative; for other roles it is the (optional) requested filter.
 */
function parseBranchId(raw?: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
