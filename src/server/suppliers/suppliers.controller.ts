import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('suppliers')
// Reads are deliberately ungated, matching products / materials / branches:
// the supplier picker in the material stock-card dialog needs this list, so
// gating it at the class level broke that screen for anyone holding
// `material-stock` without `suppliers`. Writes stay gated per method.
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequireFeature('suppliers:create')
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateSupplierDto) {
    return this.suppliersService.create(body);
  }

  @Get()
  findAll() {
    return this.suppliersService.findAll();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.suppliersService.search(q ?? '');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @RequireFeature('suppliers:edit')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, body);
  }

  @Delete(':id')
  @RequireFeature('suppliers:delete')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.remove(id);
  }
}
