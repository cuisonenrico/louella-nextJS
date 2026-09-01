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
import { MaterialGapsQueryDto } from './dto/material-gaps-query.dto';
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
  initDate(@Query('date') date: string, @CurrentUser() user: { id: number }) {
    return this.materialInventoryService.initDate(date, user?.id);
  }

  @Post('init-range')
  @RequireFeature('material-stock:init')
  @Roles(UserRole.INVENTORY)
  initDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string | undefined,
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.initDateRange(
      startDate,
      endDate,
      user?.id,
    );
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
  findByDate(@Query('date') date: string) {
    return this.materialInventoryService.findByDate(date);
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
