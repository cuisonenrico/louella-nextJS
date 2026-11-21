import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

type Actor = { id: number };

/** Admin-only, like the rest of the employee records. */
@Controller('companies')
@Roles(UserRole.ADMIN)
@RequireFeature('employees')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.companies.list(includeInactive === 'true');
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @CurrentUser() user: Actor) {
    return this.companies.create(dto.name, user.id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyDto, @CurrentUser() user: Actor) {
    return this.companies.update(id, dto, user.id);
  }
}
