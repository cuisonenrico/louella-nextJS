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
import { Idempotent } from '../common/decorators/idempotent.decorator';

@Controller('inventory-adjustments')
@RequireFeature('inventory-adjustments')
@ApiTags('inventory-adjustments')
@ApiBearerAuth()
export class InventoryAdjustmentsController {
  constructor(
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
  ) {}

  @Post()
  @Idempotent()
  @RequireFeature('inventory-adjustments:create')
  @Roles(UserRole.INVENTORY)
  create(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.create(dto, user);
  }

  @Post('transfer')
  @Idempotent()
  @RequireFeature('inventory-adjustments:transfer')
  @Roles(UserRole.INVENTORY)
  @ApiOperation({
    summary: 'Send stock to another branch (pending until the receiver accepts)',
    description:
      'Books a PENDING PULL_OUT on the source inventory at once. The PULL_IN on the destination is created when the receiving branch accepts (POST /:id/accept); rejecting (POST /:id/reject) reverses the PULL_OUT. Both records must track the same product and day.',
  })
  transfer(@Body() dto: CreateTransferDto, @CurrentUser() user: RequestUser) {
    return this.inventoryAdjustmentsService.transfer(dto, user);
  }

  /**
   * Transfers awaiting the receiving branch's answer. A branch-scoped caller
   * sees their branch's incoming and outgoing ones.
   */
  @Get('transfers/pending')
  listPendingTransfers(
    @CurrentUser() user: RequestUser,
    @Query('branchId') branchIdStr?: string,
  ) {
    const parsed = branchIdStr ? Number.parseInt(branchIdStr, 10) : undefined;
    return this.inventoryAdjustmentsService.listPending(
      user,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  /** The receiving branch confirms a transfer arrived. */
  @Post(':id/accept')
  @Idempotent()
  @RequireFeature('inventory-adjustments:transfer')
  @Roles(UserRole.INVENTORY)
  acceptTransfer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.acceptTransfer(id, user);
  }

  /** The receiving branch says a transfer did not arrive; the sender is credited back. */
  @Post(':id/reject')
  @Idempotent()
  @RequireFeature('inventory-adjustments:transfer')
  @Roles(UserRole.INVENTORY)
  rejectTransfer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventoryAdjustmentsService.rejectTransfer(id, user);
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
