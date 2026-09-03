import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  InventoryAdjustmentsService,
  type RequestUser,
} from './inventory-adjustments.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateInventoryAdjustmentDto } from './dto/update-inventory-adjustment.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('inventory-adjustments')
@RequireFeature('inventory-adjustments')
@ApiTags('inventory-adjustments')
@ApiBearerAuth()
export class InventoryAdjustmentsController {
  constructor(
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
  ) {}

  @Post()
  @RequireFeature('inventory-adjustments:create')
  @Roles(UserRole.INVENTORY)
  create(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.create(dto, user);
  }

  @Post('transfer')
  @RequireFeature('inventory-adjustments:transfer')
  @Roles(UserRole.INVENTORY)
  @ApiOperation({
    summary: 'Transfer stock between two branches',
    description:
      'Atomically creates a linked PULL_OUT on the source inventory and a PULL_IN on the destination inventory. Both records must track the same product.',
  })
  transfer(@Body() dto: CreateTransferDto, @CurrentUser() user: RequestUser) {
    return this.inventoryAdjustmentsService.transfer(dto, user);
  }

  @Get('inventory/:inventoryId')
  findByInventory(
    @Param('inventoryId', ParseIntPipe) inventoryId: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.findByInventory(inventoryId, user);
  }

  @Patch(':id')
  @RequireFeature('inventory-adjustments:edit')
  @Roles(UserRole.INVENTORY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryAdjustmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequireFeature('inventory-adjustments:delete')
  @Roles(UserRole.INVENTORY)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.remove(id, user);
  }
}
