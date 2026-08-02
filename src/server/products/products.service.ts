import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductOrderDto } from './dto/update-product-order.dto';

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
            effectiveAt: body.priceEffectiveAt
              ? new Date(body.priceEffectiveAt)
              : new Date(),
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
