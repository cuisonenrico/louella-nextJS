import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  IMPORT_UPLOAD_LIMITS,
  InventoryImportController,
} from './inventory-import.controller';
import { InventoryImportService } from './inventory-import.service';

/**
 * The upload cap is enforced by multer inside FileInterceptor, before the
 * handler runs — so it has to be exercised over HTTP to mean anything.
 */
describe('InventoryImportController upload limit', () => {
  let app: INestApplication;
  const service = { dryRunWorkbook: jest.fn().mockResolvedValue({ ok: true }) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryImportController],
      providers: [{ provide: InventoryImportService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => service.dryRunWorkbook.mockClear());

  it('accepts a workbook under the cap', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory-import/preview')
      .attach('file', Buffer.alloc(1024), 'sheet.xlsx');

    expect(res.status).toBe(201);
    expect(service.dryRunWorkbook).toHaveBeenCalledTimes(1);
  });

  it('rejects a file over the cap with 413, before the service sees it', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory-import/preview')
      .attach('file', Buffer.alloc(IMPORT_UPLOAD_LIMITS.fileSize + 1), 'sheet.xlsx');

    expect(res.status).toBe(413);
    expect(service.dryRunWorkbook).not.toHaveBeenCalled();
  });
});
