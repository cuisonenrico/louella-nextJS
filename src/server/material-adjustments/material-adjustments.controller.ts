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

@Controller('material-adjustments')
export class MaterialAdjustmentsController {
  constructor(private readonly service: MaterialAdjustmentsService) {}

  @Post()
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
  @Roles(UserRole.INVENTORY)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
