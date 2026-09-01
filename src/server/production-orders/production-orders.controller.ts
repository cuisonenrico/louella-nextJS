import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BranchGuard } from '../common/guards/branch.guard';
import { ProductionOrdersService } from './production-orders.service';
import { SuggestionsService } from './suggestions.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { SuggestionsQueryDto } from './dto/suggestions-query.dto';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('production-orders')
@RequireFeature('production-orders')
@ApiTags('production-orders')
@ApiBearerAuth()
@UseGuards(RolesGuard, BranchGuard)
export class ProductionOrdersController {
  constructor(
    private readonly service: ProductionOrdersService,
    private readonly suggestionsService: SuggestionsService,
  ) {}

  private parseOptionalBranchId(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  @Post()
  @RequireFeature('production-orders:create')
  @Roles(UserRole.MANAGER)
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findAll(
      page,
      limit,
      this.parseOptionalBranchId(branchId),
    );
  }

  @Get('by-date')
  @RequireFeature('production-orders', 'dashboard:branch-orders')
    // The dashboard aggregates this, so a role holding `dashboard` but not the
    // owning screen's key must still be able to read it.
  @RequireFeature('production-orders', 'dashboard')
  findByDate(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findByDate(date, this.parseOptionalBranchId(branchId));
  }

  @Get('planned-yield')
  @RequireFeature('production-orders:planned-yield')
  getPlannedYield(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getPlannedYieldByDate(
      date,
      this.parseOptionalBranchId(branchId),
    );
  }

  @Get('suggestions')
  @RequireFeature('production-orders:suggestions')
  @Roles(UserRole.VIEWER)
  getSuggestions(@Query() query: SuggestionsQueryDto) {
    return this.suggestionsService.getSuggestions(
      Number.parseInt(query.branchId, 10),
      query.period ?? '7d',
      query.date,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findOne(id, this.parseOptionalBranchId(branchId));
  }

  @Patch(':id')
  @RequireFeature('production-orders:edit')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductionOrderDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.update(id, dto, this.parseOptionalBranchId(branchId));
  }

  @Delete(':id')
  @RequireFeature('production-orders:delete')
  @Roles(UserRole.MANAGER)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.remove(id, this.parseOptionalBranchId(branchId));
  }
}
