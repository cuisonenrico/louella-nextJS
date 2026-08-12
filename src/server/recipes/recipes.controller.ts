import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RecipesService } from './recipes.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Post()
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateRecipeDto) {
    return this.recipesService.create(body);
  }

  @Get()
  @Header('Cache-Control', 'private, max-age=60')
  findAll() {
    return this.recipesService.findAll();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.recipesService.search(q ?? '');
  }

  @Get('product/:productId')
  findByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.recipesService.findByProduct(productId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recipesService.findOne(id);
  }

  @Get(':id/cost')
  calculateCost(@Param('id', ParseIntPipe) id: number) {
    return this.recipesService.calculateCost(id);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateRecipeDto) {
    return this.recipesService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.recipesService.remove(id);
  }
}
