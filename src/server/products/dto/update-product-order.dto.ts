import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ProductOrderItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({
    example: 0,
    description: 'Display order index within the selected type (0-based).',
  })
  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class UpdateProductOrderDto {
  @ApiProperty({
    enum: ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'],
    example: 'BREAD',
  })
  @IsIn(['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'])
  type: 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';

  @ApiProperty({ type: [ProductOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductOrderItemDto)
  items: ProductOrderItemDto[];
}
