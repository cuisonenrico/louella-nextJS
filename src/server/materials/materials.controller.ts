import {
  Body,
  Controller,
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
import { MaterialsService } from './materials.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateMaterialDto) {
    return this.materialsService.create(body);
  }

  @Post('bulk')
  @Roles(UserRole.MANAGER)
  createBulk(
    @Body(new ParseArrayPipe({ items: CreateMaterialDto }))
    body: CreateMaterialDto[],
  ) {
    return this.materialsService.createBulk(body);
  }

  @Get()
  findAll() {
    return this.materialsService.findAll();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.materialsService.search(q ?? '');
  }

  @Get('low-stock')
  findLowStock() {
    return this.materialsService.findLowStock();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.findOne(id);
  }

  @Get(':id/price-history')
  getPriceHistory(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.getPriceHistory(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMaterialDto,
  ) {
    return this.materialsService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.remove(id);
  }
}
