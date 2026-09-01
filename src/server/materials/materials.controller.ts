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
import { RequireFeature } from '../common/decorators/require-feature.decorator';

// Catalog READS are deliberately left ungated: branch, product and material
// lists feed pickers on nearly every screen (and the shipped Flutter build
// calls them from roles that hold no catalog key), so requiring the key here
// would break screens the user is entitled to. Writes carry the key.
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @RequireFeature('materials:create')
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateMaterialDto) {
    return this.materialsService.create(body);
  }

  @Post('bulk')
  @RequireFeature('materials:create')
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
  @RequireFeature('materials', 'low-stock')
  findLowStock() {
    return this.materialsService.findLowStock();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.findOne(id);
  }

  @Get(':id/price-history')
  @RequireFeature('materials:price-history')
  getPriceHistory(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.getPriceHistory(id);
  }

  @Patch(':id')
  @RequireFeature('materials:edit')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateMaterialDto,
  ) {
    return this.materialsService.update(id, body);
  }

  @Delete(':id')
  @RequireFeature('materials:delete')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.materialsService.remove(id);
  }
}
