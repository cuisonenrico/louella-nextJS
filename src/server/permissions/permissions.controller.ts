import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { PermissionsService } from './permissions.service';
import { SetPermissionDto } from './dto/set-permission.dto';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('permissions')
@RequireFeature('permissions')
@UseGuards(RolesGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('matrix')
  @Roles(UserRole.ADMIN)
  getMatrix() {
    return this.permissionsService.getMatrix();
  }

  @Get('users/:userId/matrix')
  @Roles(UserRole.ADMIN)
  getUserMatrix(@Param('userId', ParseIntPipe) userId: number) {
    return this.permissionsService.getUserMatrix(userId);
  }

  @Put('roles/:role')
  @RequireFeature('permissions:edit')
  @Roles(UserRole.ADMIN)
  setRolePermission(
    @Param('role') role: string,
    @Body() dto: SetPermissionDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.permissionsService.setRolePermission(
      role as UserRole,
      dto.featureKey,
      dto.enabled,
      user.id,
    );
  }

  @Put('users/:userId')
  @RequireFeature('permissions:edit')
  @Roles(UserRole.ADMIN)
  setUserPermission(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetPermissionDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.permissionsService.setUserPermission(
      userId,
      dto.featureKey,
      dto.enabled,
      user.id,
    );
  }

  @Delete('users/:userId/:featureKey')
  @RequireFeature('permissions:edit')
  @Roles(UserRole.ADMIN)
  resetUserPermission(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('featureKey') featureKey: string,
  ) {
    return this.permissionsService.resetUserPermission(userId, featureKey);
  }
}
