import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MaterialAdjustmentsService } from './material-adjustments.service';
import { CreateMaterialAdjustmentDto } from './dto/create-material-adjustment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('material-adjustments')
@RequireFeature('material-stock')
export class MaterialAdjustmentsController {
  constructor(private readonly service: MaterialAdjustmentsService) {}

  @Post()
  @RequireFeature('material-stock:adjust')
  @Roles(UserRole.INVENTORY)
  create(@Body() body: CreateMaterialAdjustmentDto) {
    return this.service.create(body);
  }

  @Get()
  listByMaterialInventory(
    @Query('materialInventoryId', ParseIntPipe) materialInventoryId: number,
  ) {
    return this.service.listByMaterialInventory(materialInventoryId);
  }

  @Delete(':id')
  @RequireFeature('material-stock:adjust')
  @Roles(UserRole.INVENTORY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
