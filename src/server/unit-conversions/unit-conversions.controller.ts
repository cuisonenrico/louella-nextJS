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
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UnitConversionsService } from './unit-conversions.service';
import { CreateUnitConversionDto } from './dto/create-unit-conversion.dto';
import { UpdateUnitConversionDto } from './dto/update-unit-conversion.dto';
import { ConvertQuantityDto } from './dto/convert-quantity.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('unit-conversions')
export class UnitConversionsController {
  constructor(
    private readonly unitConversionsService: UnitConversionsService,
  ) {}

  @Post()
  @RequireFeature('unit-conversions:create')
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateUnitConversionDto) {
    return this.unitConversionsService.create(body);
  }

  @Post('convert')
  @RequireFeature('unit-conversions', 'material-stock', 'inventory-adjustments')
  @Roles(UserRole.INVENTORY)
  async convertQuantity(@Body() body: ConvertQuantityDto) {
    const result = await this.unitConversionsService.convert(
      body.quantity,
      body.fromUnit,
      body.toUnit,
    );
    return {
      quantity: body.quantity,
      fromUnit: body.fromUnit,
      toUnit: body.toUnit,
      result,
    };
  }

  @Get()
  @Header('Cache-Control', 'private, max-age=60')
  findAll() {
    return this.unitConversionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.unitConversionsService.findOne(id);
  }

  @Patch(':id')
  @RequireFeature('unit-conversions:edit')
  @Roles(UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUnitConversionDto,
  ) {
    return this.unitConversionsService.update(id, body);
  }

  @Delete(':id')
  @RequireFeature('unit-conversions:delete')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.unitConversionsService.remove(id);
  }
}
