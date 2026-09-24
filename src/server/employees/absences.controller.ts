import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { AbsencesService } from './absences.service';
import { CreateAbsenceDto, ListAbsencesQuery } from './dto/absence.dto';

@Controller('absences')
@Roles(UserRole.ADMIN)
@RequireFeature('employees')
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  @Get()
  findAll(@Query() q: ListAbsencesQuery) {
    return this.absences.list(q);
  }

  @Post()
  create(@Body() dto: CreateAbsenceDto, @CurrentUser() user: { id: number }) {
    return this.absences.create(dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { id: number }) {
    return this.absences.remove(id, user.id);
  }
}
