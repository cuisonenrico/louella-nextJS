import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import {
  InventoryImportService,
  type CreateProductRequest,
  type ImportConflictMode,
} from './inventory-import.service';
import type { ProductType } from './sheet-sections';
import type { Express } from 'express';

const PRODUCT_TYPES: readonly ProductType[] = [
  'BREAD',
  'CAKE',
  'SPECIAL',
  'MISCELLANEOUS',
];

/**
 * Multipart bodies carry only strings, so both resolution fields arrive as
 * JSON text. Anything malformed is rejected here rather than reaching the
 * service, where a bad shape would be indistinguishable from "no decisions
 * supplied" and the import would refuse with a confusing message.
 */
function parseJsonArray(raw: string | undefined, field: string): unknown[] {
  if (raw === undefined || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException(`${field} must be valid JSON.`);
  }
  if (!Array.isArray(parsed))
    throw new BadRequestException(`${field} must be a JSON array.`);
  return parsed;
}

function parseLabelList(raw: string | undefined, field: string): string[] {
  const items = parseJsonArray(raw, field);
  for (const item of items) {
    if (typeof item !== 'string' || item.trim() === '')
      throw new BadRequestException(
        `${field} must contain only non-empty strings.`,
      );
  }
  return items as string[];
}

function parseCreateProducts(raw: string | undefined): CreateProductRequest[] {
  const items = parseJsonArray(raw, 'createProducts');
  return items.map((item) => {
    if (typeof item !== 'object' || item === null)
      throw new BadRequestException(
        'createProducts must contain { label, type } objects.',
      );
    const { label, type } = item as { label?: unknown; type?: unknown };
    if (typeof label !== 'string' || label.trim() === '')
      throw new BadRequestException(
        'Each createProducts entry needs a non-empty label.',
      );
    if (!PRODUCT_TYPES.includes(type as ProductType))
      throw new BadRequestException(
        `Each createProducts entry needs a type of ${PRODUCT_TYPES.join(', ')}.`,
      );
    return { label, type: type as ProductType };
  });
}

@Controller('inventory-import')
@UseGuards(RolesGuard)
export class InventoryImportController {
  constructor(private readonly service: InventoryImportService) {}

  private validateFile(file: Express.Multer.File): void {
    if (!file)
      throw new BadRequestException('No file uploaded. Use field name "file".');
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (
      !allowed.includes(file.mimetype) &&
      !file.originalname.match(/\.xlsx?$/i)
    )
      throw new BadRequestException('Only .xlsx or .xls files are accepted.');
  }

  @Post('preview')
  @Roles(UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: Express.Multer.File,
    @Body('branchId') branchIdStr?: string,
  ) {
    this.validateFile(file);
    let branchId: number | undefined;
    if (branchIdStr) {
      branchId = parseInt(branchIdStr, 10);
      if (isNaN(branchId))
        throw new BadRequestException('branchId must be a valid integer.');
    }
    return this.service.dryRunWorkbook(
      file.buffer,
      file.originalname,
      branchId,
    );
  }

  @Post('import')
  @Roles(UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Body('branchId') branchIdStr: string,
    @CurrentUser() user: { id: number },
    @Body('conflictMode') conflictMode?: string,
    @Body('createProducts') createProducts?: string,
    @Body('acknowledgeUnmatched') acknowledgeUnmatched?: string,
  ) {
    this.validateFile(file);
    if (!branchIdStr) throw new BadRequestException('branchId is required.');
    const branchId = parseInt(branchIdStr, 10);
    if (isNaN(branchId))
      throw new BadRequestException('branchId must be a valid integer.');
    if (
      conflictMode !== undefined &&
      conflictMode !== 'skip' &&
      conflictMode !== 'overwrite'
    )
      throw new BadRequestException(
        'conflictMode must be "skip" or "overwrite".',
      );
    return this.service.importWorkbook(
      file.buffer,
      branchId,
      file.originalname,
      user?.id,
      (conflictMode as ImportConflictMode) ?? 'skip',
      parseCreateProducts(createProducts),
      parseLabelList(acknowledgeUnmatched, 'acknowledgeUnmatched'),
    );
  }

  @Get('logs')
  @Roles(UserRole.MANAGER)
  getLogs(
    @Query('branchId') branchId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1)
      throw new BadRequestException('page must be a positive integer.');
    if (isNaN(limitNum) || limitNum < 1)
      throw new BadRequestException('limit must be a positive integer.');
    const branchIdNum = branchId ? parseInt(branchId, 10) : undefined;
    if (branchId && isNaN(branchIdNum!))
      throw new BadRequestException('branchId must be a valid integer.');
    return this.service.getLogs({
      branchId: branchIdNum,
      page: pageNum,
      limit: Math.min(limitNum, 100),
    });
  }

  @Delete('logs/:id')
  @Roles(UserRole.ADMIN)
  deleteLog(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteLog(id);
  }
}
