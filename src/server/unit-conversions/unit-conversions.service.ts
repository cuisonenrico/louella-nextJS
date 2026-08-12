import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MeasurementUnit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitConversionDto } from './dto/create-unit-conversion.dto';
import { UpdateUnitConversionDto } from './dto/update-unit-conversion.dto';

@Injectable()
export class UnitConversionsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async create(body: CreateUnitConversionDto) {
    if (body.fromUnit === body.toUnit) {
      throw new BadRequestException('fromUnit and toUnit must be different');
    }

    const existing = await this.prisma.unitConversion.findUnique({
      where: {
        fromUnit_toUnit: { fromUnit: body.fromUnit, toUnit: body.toUnit },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Conversion ${body.fromUnit}→${body.toUnit} already exists`,
      );
    }

    // Create the forward conversion and its inverse atomically
    const [forward] = await this.prisma.$transaction([
      this.prisma.unitConversion.create({
        data: {
          fromUnit: body.fromUnit,
          toUnit: body.toUnit,
          factor: body.factor,
        },
      }),
      this.prisma.unitConversion.upsert({
        where: {
          fromUnit_toUnit: { fromUnit: body.toUnit, toUnit: body.fromUnit },
        },
        update: { factor: 1 / body.factor },
        create: {
          fromUnit: body.toUnit,
          toUnit: body.fromUnit,
          factor: 1 / body.factor,
        },
      }),
    ]);

    return forward;
  }

  findAll() {
    return this.prisma.unitConversion.findMany({
      orderBy: [{ fromUnit: 'asc' }, { toUnit: 'asc' }],
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.unitConversion.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Unit conversion not found');
    }
    return record;
  }

  async update(id: number, body: UpdateUnitConversionDto) {
    const record = await this.prisma.unitConversion.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Unit conversion not found');
    }

    if (body.factor === undefined) {
      return record;
    }

    // Update forward and keep inverse in sync
    const [updated] = await this.prisma.$transaction([
      this.prisma.unitConversion.update({
        where: { id },
        data: { factor: body.factor },
      }),
      this.prisma.unitConversion.updateMany({
        where: { fromUnit: record.toUnit, toUnit: record.fromUnit },
        data: { factor: 1 / body.factor },
      }),
    ]);

    return updated;
  }

  async remove(id: number) {
    const record = await this.prisma.unitConversion.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException('Unit conversion not found');
    }

    // Remove both directions
    await this.prisma.$transaction([
      this.prisma.unitConversion.delete({ where: { id } }),
      this.prisma.unitConversion.deleteMany({
        where: { fromUnit: record.toUnit, toUnit: record.fromUnit },
      }),
    ]);

    return record;
  }

  // -------------------------------------------------------------------------
  // Conversion utility — used internally by RecipesService and cost reporters
  // -------------------------------------------------------------------------

  /**
   * Convert `quantity` from `fromUnit` to `toUnit`.
   * Returns the same quantity unchanged when both units are equal.
   * Throws if no conversion path is defined.
   */
  async convert(
    quantity: number,
    fromUnit: MeasurementUnit,
    toUnit: MeasurementUnit,
  ): Promise<number> {
    if (fromUnit === toUnit) return quantity;

    const conversion = await this.prisma.unitConversion.findUnique({
      where: { fromUnit_toUnit: { fromUnit, toUnit } },
    });

    if (!conversion) {
      throw new UnprocessableEntityException(
        `No unit conversion defined for ${fromUnit}→${toUnit}. ` +
          `Add it via POST /unit-conversions first.`,
      );
    }

    return quantity * conversion.factor;
  }
}
