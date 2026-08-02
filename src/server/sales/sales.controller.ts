import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SalesService } from './sales.service';
import { SalesDateQueryDto } from './dto/sales-date-query.dto';
import { SalesRangeQueryDto } from './dto/sales-range-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { BranchGuard } from '../common/guards/branch.guard';

@Controller('sales')
@Roles(UserRole.VIEWER)
@UseGuards(BranchGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // GET /sales/branch/:branchId/date?date=2026-02-19
  @Get('branch/:branchId/date')
  getByBranchAndDate(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query() query: SalesDateQueryDto,
  ) {
    return this.salesService.getByBranchAndDate(branchId, query.date);
  }

  // GET /sales/branch/:branchId?startDate=2026-01-19&endDate=2026-02-19
  @Get('branch/:branchId')
  getByBranch(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query() query: SalesRangeQueryDto,
  ) {
    return this.salesService.getByBranch(
      branchId,
      query.startDate,
      query.endDate,
    );
  }

  // GET /sales/branch/:branchId/product/:productId?startDate=&endDate=
  @Get('branch/:branchId/product/:productId')
  getByBranchAndProduct(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Param('productId', ParseIntPipe) productId: number,
    @Query() query: SalesRangeQueryDto,
  ) {
    return this.salesService.getByBranchAndProduct(
      branchId,
      productId,
      query.startDate,
      query.endDate,
    );
  }

  // GET /sales/product/:productId?startDate=&endDate=
  @Get('product/:productId')
  getByProduct(
    @Param('productId', ParseIntPipe) productId: number,
    @Query() query: SalesRangeQueryDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    const branchId =
      branchIdStr != null && branchIdStr !== ''
        ? parseInt(branchIdStr, 10)
        : undefined;
    return this.salesService.getByProduct(
      productId,
      query.startDate,
      query.endDate,
      Number.isFinite(branchId as number) ? branchId : undefined,
    );
  }

  // GET /sales/branch/:branchId/summary?startDate=&endDate=
  @Get('branch/:branchId/summary')
  getDailySummary(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Query() query: SalesRangeQueryDto,
  ) {
    return this.salesService.getDailySummary(
      branchId,
      query.startDate,
      query.endDate,
    );
  }
}
