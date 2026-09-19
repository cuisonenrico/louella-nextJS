import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MaterialAdjustmentsService } from './material-adjustments.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma(): Record<string, any> {
  const prisma: Record<string, any> = {
    materialInventory: {
      findFirst: jest.fn(),
      // Carry-forward's read of later cards: none here. Its effect on the
      // chain is covered in stock-chain.spec.ts.
      findMany: jest.fn().mockResolvedValue([]),
    },
    materialAdjustment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe('MaterialAdjustmentsService', () => {
  let service: MaterialAdjustmentsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialAdjustmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MaterialAdjustmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const body = {
      materialInventoryId: 4,
      type: 'PULL_OUT' as const,
      value: 2.5,
      notes: 'spillage',
    };

    it('rejects an unknown stock card', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue(null);
      await expect(service.create(body)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stamps the calling user as the author', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue({ id: 4 });
      prisma.materialAdjustment.create.mockResolvedValue({ id: 8 });

      await service.create(body, 7);

      expect(prisma.materialAdjustment.create).toHaveBeenCalledWith({
        data: {
          materialInventoryId: 4,
          type: 'PULL_OUT',
          value: 2.5,
          notes: 'spillage',
          createdById: 7,
        },
      });
    });

    it('records no author when the caller is unknown', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue({ id: 4 });
      prisma.materialAdjustment.create.mockResolvedValue({ id: 8 });

      await service.create(body);

      expect(prisma.materialAdjustment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ createdById: null }),
      });
    });
  });

  describe('listByMaterialInventory', () => {
    it('excludes soft-deleted adjustments', async () => {
      prisma.materialAdjustment.findMany.mockResolvedValue([]);

      await service.listByMaterialInventory(4);

      expect(prisma.materialAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            materialInventoryId: 4,
            deletedAt: null,
            // The card's own deletedAt matters too: this query addresses
            // adjustments by id, so a deleted card's history stayed readable
            // without it even though the card is hidden everywhere else.
            materialInventory: { deletedAt: null },
          },
        }),
      );
    });
  });

  describe('remove', () => {
    it('rejects an adjustment that is already gone', async () => {
      prisma.materialAdjustment.findFirst.mockResolvedValue(null);
      await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('soft-deletes rather than hard-deletes', async () => {
      prisma.materialAdjustment.findFirst.mockResolvedValue({
        id: 1,
        materialInventory: { materialId: 3, date: new Date('2026-09-02') },
      });
      prisma.materialAdjustment.update.mockResolvedValue({ id: 1 });

      await service.remove(1);

      expect(prisma.materialAdjustment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stock cap
  //
  // The finished-goods side caps a PULL_OUT at the stock on hand. Material
  // stock had no equivalent, so a card could be pulled below zero and the
  // negative balance carried into the next day's opening.
  // ─────────────────────────────────────────────────────────────────────────

  describe('pull-out stock cap', () => {
    const card = (adjustments: { type: string; value: number }[] = []) => ({
      id: 4,
      quantity: 10,
      delivery: 5,
      used: 3,
      adjustments,
    });

    it('refuses a pull-out larger than the stock on the card', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue(card());

      await expect(
        service.create({
          materialInventoryId: 4,
          type: 'PULL_OUT',
          value: 50,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.materialAdjustment.create).not.toHaveBeenCalled();
    });

    it('allows a pull-out that the card can cover', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue(card());
      prisma.materialAdjustment.create.mockResolvedValue({ id: 1 });

      await service.create({
        materialInventoryId: 4,
        type: 'PULL_OUT',
        value: 12,
      });

      expect(prisma.materialAdjustment.create).toHaveBeenCalled();
    });

    it('counts existing adjustments against the available stock', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue(
        card([{ type: 'PULL_OUT', value: 10 }]),
      );

      await expect(
        service.create({
          materialInventoryId: 4,
          type: 'PULL_OUT',
          value: 8,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not cap an ANOMALY, which records what already happened', async () => {
      prisma.materialInventory.findFirst.mockResolvedValue(card());
      prisma.materialAdjustment.create.mockResolvedValue({ id: 1 });

      await service.create({
        materialInventoryId: 4,
        type: 'ANOMALY',
        value: 500,
      });

      expect(prisma.materialAdjustment.create).toHaveBeenCalled();
    });
  });
});
