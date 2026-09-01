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
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

// Catalog READS are deliberately left ungated: branch, product and material
// lists feed pickers on nearly every screen (and the shipped Flutter build
// calls them from roles that hold no catalog key), so requiring the key here
// would break screens the user is entitled to. Writes carry the key.
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @RequireFeature('branches:create')
  @Roles(UserRole.MANAGER)
  create(@Body() body: CreateBranchDto) {
    return this.branchesService.create(body);
  }

  @Get()
  findAll() {
    return this.branchesService.findAll();
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.branchesService.search(q ?? '');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.branchesService.findOne(id);
  }

  @Patch(':id')
  @RequireFeature('branches:edit')
  @Roles(UserRole.MANAGER)
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateBranchDto) {
    return this.branchesService.update(id, body);
  }

  @Delete(':id')
  @RequireFeature('branches:delete')
  @Roles(UserRole.MANAGER)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.branchesService.remove(id);
  }
}
