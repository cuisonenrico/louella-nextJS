import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductOrderDto } from './dto/update-product-order.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

// Catalog READS are deliberately left ungated: branch, product and material
// lists feed pickers on nearly every screen (and the shipped Flutter build
// calls them from roles that hold no catalog key), so requiring the key here
// would break screens the user is entitled to. Writes carry the key.
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequireFeature('products:create')
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateProductDto) {
    return this.productsService.create(body);
  }

  @Post('bulk')
  @RequireFeature('products:create')
  @Roles(UserRole.MANAGER)
  createBulk(
    @Body(new ParseArrayPipe({ items: CreateProductDto }))
    body: CreateProductDto[],
  ) {
    return this.productsService.createBulk(body);
  }

  @Get()
  @Header('Cache-Control', 'private, max-age=60')
  findAll() {
    return this.productsService.findAll();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.productsService.search(q ?? '');
  }

  @Patch('order')
  @RequireFeature('product-order-config:edit')
  @Roles(UserRole.MANAGER)
  updateOrder(@Body() body: UpdateProductOrderDto) {
    return this.productsService.updateOrder(body);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Get(':id/price-history')
  @RequireFeature('products:price-history')
  getPriceHistory(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.getPriceHistory(id);
  }

  @Patch(':id')
  @RequireFeature('products:edit')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(id, body);
  }

  @Delete(':id')
  @RequireFeature('products:delete')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
