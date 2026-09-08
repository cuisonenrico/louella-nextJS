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
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MaterialInventoryService } from './material-inventory.service';
import { CreateMaterialInventoryDto } from './dto/create-material-inventory.dto';
import { UpdateMaterialInventoryDto } from './dto/update-material-inventory.dto';
import { UpdateMaterialInventoryItemDto } from './dto/update-material-inventory-bulk.dto';
import { MaterialGapsQueryDto } from './dto/material-gaps-query.dto';
import { MaterialInventoryDateQueryDto } from './dto/material-inventory-date-query.dto';
import { MaterialInitRangeQueryDto } from './dto/material-init-range-query.dto';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Autofill } from '../common/decorators/autofill.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('material-inventory')
@RequireFeature('material-stock')
export class MaterialInventoryController {
  constructor(
    private readonly materialInventoryService: MaterialInventoryService,
  ) {}

  @Post()
  @RequireFeature('material-stock:create')
  @Roles(UserRole.INVENTORY)
  create(
    @Body() body: CreateMaterialInventoryDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.create(body, user?.id);
  }

  @Post('bulk')
  @RequireFeature('material-stock:create')
  @Roles(UserRole.INVENTORY)
  createBulk(
    @Body(new ParseArrayPipe({ items: CreateMaterialInventoryDto }))
    body: CreateMaterialInventoryDto[],
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.createBulk(body, user?.id);
  }

  @Post('init')
  @RequireFeature('material-stock:init')
  @Roles(UserRole.INVENTORY)
  initDate(
    @Query() query: MaterialInventoryDateQueryDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.initDate(query.date, user?.id);
  }

  @Post('init-range')
  @RequireFeature('material-stock:init')
  @Roles(UserRole.INVENTORY)
  initDateRange(
    @Query() query: MaterialInitRangeQueryDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.initDateRange(
      query.startDate,
      query.endDate,
      user?.id,
    );
  }

  // One request for a whole sheet save; the per-row PATCH below still serves a
  // single edit.
  @Patch('bulk')
  @RequireFeature('material-stock:edit')
  @Roles(UserRole.INVENTORY)
  updateBulk(
    @Body(new ParseArrayPipe({ items: UpdateMaterialInventoryItemDto }))
    body: UpdateMaterialInventoryItemDto[],
  ) {
    return this.materialInventoryService.updateBulk(body);
  }

  @Get('gaps')
  getGaps(@Query() query: MaterialGapsQueryDto) {
    return this.materialInventoryService.getGaps(
      query.startDate,
      query.endDate,
    );
  }

  @Get('dates')
  listDates() {
    return this.materialInventoryService.listDates();
  }

  // The material stock sheet — the page whose rows the material autofill
  // creates, so it carries the trigger the 11 PM cron used to provide.
  @Autofill('materials')
  @Get('by-date')
  findByDate(@Query() query: MaterialInventoryDateQueryDto) {
    return this.materialInventoryService.findByDate(query.date);
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number,
  ) {
    return this.materialInventoryService.findAll(page, limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.materialInventoryService.findOne(id);
  }

  @Patch(':id')
  @RequireFeature('material-stock:edit')
  @Roles(UserRole.INVENTORY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMaterialInventoryDto,
  ) {
    return this.materialInventoryService.update(id, body);
  }

  @Delete(':id')
  @RequireFeature('material-stock:delete')
  @Roles(UserRole.INVENTORY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.materialInventoryService.remove(id);
  }
}
