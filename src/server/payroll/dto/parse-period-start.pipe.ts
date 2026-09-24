import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isPeriodStart } from '@/lib/payroll/cutoff';

/** A route or query `periodStart`: the 1st or 16th of a month. */
@Injectable()
export class ParsePeriodStartPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !isPeriodStart(value)) {
      throw new BadRequestException('periodStart must be the 1st or 16th of a month, as YYYY-MM-DD');
    }
    return value;
  }
}
