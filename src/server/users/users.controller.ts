import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

// Gated per-method rather than on the controller: `me/permissions` must remain
// reachable by every authenticated user, since the client fetches it to learn
// what it may render.
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Resolved by JwtStrategy inside the auth lookup that already runs on every
  // request, so this costs no additional query.
  @Get('me/permissions')
  myPermissions(@CurrentUser() user: { permissions: string[] }) {
    return { features: user.permissions };
  }

  @Get()
  @RequireFeature('user-management')
  @Roles(UserRole.ADMIN)
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll(Number(page), Number(limit), search);
  }

  @Get(':id')
  @RequireFeature('user-management')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findByIdSafe(id);
  }

  @Post()
  @RequireFeature('user-management:create')
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: { id: number }) {
    return this.usersService.createByAdmin(dto, user.id);
  }

  @Patch(':id/role')
  @RequireFeature('user-management:set-role')
  @Roles(UserRole.ADMIN)
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.updateRole(id, dto.role);
  }

  @Patch(':id/branch')
  @RequireFeature('user-management:set-branch')
  @Roles(UserRole.ADMIN)
  updateBranch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.usersService.updateBranch(id, dto.branchId);
  }

  @Patch(':id/status')
  @RequireFeature('user-management:set-status')
  @Roles(UserRole.ADMIN)
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.usersService.setActive(id, dto.isActive, user.id);
  }

  @Post(':id/reset-password')
  @RequireFeature('user-management:reset-password')
  @Roles(UserRole.ADMIN)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword);
  }
}
