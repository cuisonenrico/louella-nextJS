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

@Controller('material-inventory')
export class MaterialInventoryController {
  constructor(
    private readonly materialInventoryService: MaterialInventoryService,
  ) {}

  @Post()
  @Roles(UserRole.INVENTORY)
  create(
    @Body() body: CreateMaterialInventoryDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.create(body, user?.id);
  }

  @Post('bulk')
  @Roles(UserRole.INVENTORY)
  createBulk(
    @Body(new ParseArrayPipe({ items: CreateMaterialInventoryDto }))
    body: CreateMaterialInventoryDto[],
    @CurrentUser() user: { id: number },
  ) {
    return this.materialInventoryService.createBulk(body, user?.id);
  }

  @Post('init')
  @Roles(UserRole.INVENTORY)
  initDate(@Query('date') date: string, @CurrentUser() user: { id: number }) {
    return this.materialInventoryService.initDate(date, user?.id);
  }

  @Post('init-range')
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
  @Roles(UserRole.INVENTORY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMaterialInventoryDto,
  ) {
    return this.materialInventoryService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.INVENTORY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.materialInventoryService.remove(id);
  }
}
