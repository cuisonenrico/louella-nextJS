import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { BranchCashController } from './branch-cash.controller';
import { BranchCashDaysService } from './branch-cash-days.service';
import { BranchCashEntriesService } from './branch-cash-entries.service';
import { ExpenseCategoriesService } from './expense-categories.service';

@Module({
  imports: [SalesModule],
  controllers: [BranchCashController],
  providers: [BranchCashDaysService, BranchCashEntriesService, ExpenseCategoriesService],
})
export class BranchCashModule {}
