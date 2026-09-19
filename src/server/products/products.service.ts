import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toUtcDay } from '../common/utils/date-range.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductOrderDto } from './dto/update-product-order.dto';

/**
 * The opening price-history row every product starts with.
 *
 * Revenue for a day uses the price whose `effectiveAt` is on or before it. A
 * product created with no history row had nothing to anchor its first price,
 * so when that price was later changed, every earlier sale was revalued at the
 * new one. Effective from the launch day, or today (Manila) when none is given.
 */
function openingPriceRow(price: number | undefined, launchDate?: string) {
  return {
    create: {
      price: price ?? 0,
      effectiveAt: toUtcDay(launchDate ?? new Date()),
    },
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getNextSortOrder(
    type: 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS',
  ) {
    const maxByType = await this.prisma.product.aggregate({
      where: { deletedAt: null, type },
      _max: { sortOrder: true },
    });
    return (maxByType._max.sortOrder ?? -1) + 1;
  }

  async create(body: CreateProductDto) {
    const type = body.type ?? 'BREAD';
    const sortOrder = body.sortOrder ?? (await this.getNextSortOrder(type));

    return this.prisma.product.create({
      data: {
        name: body.name,
        type,
        sortOrder,
        price: body.price,
        date: body.date ? new Date(body.date) : undefined,
        priceHistory: openingPriceRow(body.price, body.date),
      },
    });
  }

  async createBulk(items: CreateProductDto[]) {
    const itemsByType = new Map<
      'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS',
      CreateProductDto[]
    >();
    for (const item of items) {
      const type = item.type ?? 'BREAD';
      const list = itemsByType.get(type) ?? [];
      list.push(item);
      itemsByType.set(type, list);
    }

    const nextOrderByType = new Map<
      'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS',
      number
    >();
    for (const type of itemsByType.keys()) {
      nextOrderByType.set(type, await this.getNextSortOrder(type));
    }

    return this.prisma.$transaction(
      items.map((item) => {
        const type = item.type ?? 'BREAD';
        const nextOrder = nextOrderByType.get(type) ?? 0;
        const sortOrder = item.sortOrder ?? nextOrder;
        if (item.sortOrder === undefined) {
          nextOrderByType.set(type, nextOrder + 1);
        }

        return this.prisma.product.create({
          data: {
            name: item.name,
            type,
            sortOrder,
            price: item.price,
            date: item.date ? new Date(item.date) : undefined,
            priceHistory: openingPriceRow(item.price, item.date),
          },
        });
      }),
    );
  }

  findAll() {
    return this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  search(q: string) {
    return this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ name: { contains: q, mode: 'insensitive' } }],
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, isActive: true },
      include: { priceHistory: { orderBy: { effectiveAt: 'desc' } } },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: number, body: UpdateProductDto) {
    const existing = await this.findOne(id);

    const needsPriceRecord =
      body.price !== undefined && body.price !== existing.price.toNumber();

    if (needsPriceRecord) {
      const [updated] = await this.prisma.$transaction([
        this.prisma.product.update({
          where: { id },
          data: {
            name: body.name,
            type: body.type,
            sortOrder: body.sortOrder,
            price: body.price,
            date: body.date ? new Date(body.date) : undefined,
            isActive: body.isActive,
          },
        }),
        this.prisma.productPriceHistory.create({
          data: {
            productId: id,
            price: body.price!,
            // The Manila calendar day, as UTC midnight — the same form as
            // Inventory.date, which it is compared against. A raw timestamp
            // (10:00 on the 18th) sorted *after* the 18th's rows, so a change
            // made during the day only reached revenue the day after.
            effectiveAt: toUtcDay(body.priceEffectiveAt ?? new Date()),
          },
        }),
      ]);
      return updated;
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        name: body.name,
        type: body.type,
        sortOrder: body.sortOrder,
        price: body.price,
        date: body.date ? new Date(body.date) : undefined,
        isActive: body.isActive,
      },
    });
  }

  async updateOrder(body: UpdateProductOrderDto) {
    const ids = body.items.map((item) => item.id);
    const existing = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        type: body.type,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing.length !== ids.length) {
      throw new NotFoundException(
        'Some products were not found or do not match the selected type',
      );
    }

    await this.prisma.$transaction(
      body.items.map((item) =>
        this.prisma.product.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return this.prisma.product.findMany({
      where: { deletedAt: null, isActive: true, type: body.type },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getPriceHistory(id: number) {
    await this.findOne(id);
    return this.prisma.productPriceHistory.findMany({
      where: { productId: id },
      orderBy: { effectiveAt: 'desc' },
    });
  }

  async remove(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
