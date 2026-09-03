import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MaterialAdjustmentsService } from './material-adjustments.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    materialInventory: {
      findUnique: jest.fn(),
    },
    materialAdjustment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
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
      prisma.materialInventory.findUnique.mockResolvedValue(null);
      await expect(service.create(body)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stamps the calling user as the author', async () => {
      prisma.materialInventory.findUnique.mockResolvedValue({ id: 4 });
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
      prisma.materialInventory.findUnique.mockResolvedValue({ id: 4 });
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
          where: { materialInventoryId: 4, deletedAt: null },
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
      prisma.materialAdjustment.findFirst.mockResolvedValue({ id: 1 });
      prisma.materialAdjustment.update.mockResolvedValue({ id: 1 });

      await service.remove(1);

      expect(prisma.materialAdjustment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
