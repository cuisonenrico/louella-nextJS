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

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateProductDto) {
    return this.productsService.create(body);
  }

  @Post('bulk')
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
  @Roles(UserRole.MANAGER)
  updateOrder(@Body() body: UpdateProductOrderDto) {
    return this.productsService.updateOrder(body);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Get(':id/price-history')
  getPriceHistory(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.getPriceHistory(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
