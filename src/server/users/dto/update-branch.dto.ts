import { IsInt, IsPositive, ValidateIf } from 'class-validator';

export class UpdateBranchDto {
  @ValidateIf((o: UpdateBranchDto) => o.branchId !== null)
  @IsInt()
  @IsPositive()
  branchId: number | null;
}
