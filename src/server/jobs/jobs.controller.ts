import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AutofillBodyDto } from './dto/autofill-body.dto';
import { AutofillRangeBodyDto } from './dto/autofill-range-body.dto';
import { JobRunsQueryDto } from './dto/job-runs-query.dto';
import { JobsService } from './jobs.service';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('autofill')
  @Roles(UserRole.MANAGER)
  autofill(@Body() body: AutofillBodyDto) {
    return this.jobsService.autofillMissingEntries(body.targetDate, 'manual');
  }

  @Post('autofill-range')
  @Roles(UserRole.MANAGER)
  autofillRange(@Body() body: AutofillRangeBodyDto) {
    return this.jobsService.autofillDateRange(body.startDate, body.endDate);
  }

  @Post('autofill-material-stock')
  @Roles(UserRole.MANAGER)
  autofillMaterialStock(@Body() body: AutofillBodyDto) {
    return this.jobsService.autofillMaterialStock(body.targetDate, 'manual');
  }

  @Post('autofill-material-stock-range')
  @Roles(UserRole.MANAGER)
  autofillMaterialStockRange(@Body() body: AutofillRangeBodyDto) {
    return this.jobsService.autofillMaterialStockRange(
      body.startDate,
      body.endDate,
    );
  }

  @Get('runs')
  @Roles(UserRole.MANAGER)
  getRuns(@Query() query: JobRunsQueryDto) {
    return this.jobsService.getRuns(
      query.jobName,
      query.limit ? Number.parseInt(query.limit, 10) : 20,
    );
  }
}
