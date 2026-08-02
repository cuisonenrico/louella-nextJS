/**
 * Boots the Nest application inside a Next.js route handler.
 *
 * This replaces `main.ts`, which used to own the process and call
 * `app.listen()`. On Vercel there is no long-lived process and no socket to
 * listen on: the platform hands us one request at a time. Everything else
 * main.ts configured — global prefix, pipes, filters, cookie parsing, body
 * limits, the Prisma Decimal patch — is preserved verbatim, because the HTTP
 * contract the Flutter app depends on is defined by exactly those settings.
 *
 * The app is cached in module scope, so it boots once per lambda instance and
 * every later request on that instance reuses it. All API routes share this
 * single function, so warmth is shared across the whole API surface.
 */
import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';

import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { createCapturedResponse, toNodeRequest, toWebResponse } from './http-bridge';

// Serialize Prisma Decimal as a JSON number so API responses stay numeric.
// Without this patch, Decimal.toJSON() returns a string like "12.50".
(Prisma.Decimal.prototype as unknown as Record<string, unknown>)['toJSON'] =
  function (this: Prisma.Decimal): number {
    return this.toNumber();
  };

let cachedApp: Promise<Express> | null = null;

async function bootstrap(): Promise<Express> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  // Vercel always terminates TLS and proxies, so the forwarded headers are
  // trustworthy here regardless of the TRUST_PROXY env var used on Cloud Run.
  expressApp.set('trust proxy', 1);

  const corsOrigin = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
    : process.env.NODE_ENV === 'production'
      ? [] // fail closed — set ALLOWED_ORIGINS in production
      : ['http://localhost:3000', 'http://localhost:4000'];

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.setGlobalPrefix('api/v1');

  // CORS stays in Nest rather than moving to next.config headers: the
  // allowlist is dynamic and credentialed, which Next's static headers cannot
  // express. Helmet is what moved out — security headers now cover the whole
  // site, not just the API, so Next owns them.
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.use(cookieParser());
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Swagger UI is deliberately not mounted. It was already disabled in
  // production, and under the catch-all only /api/v1/* reaches Nest, so its
  // old /swagger mount point is unreachable. The @ApiProperty decorators are
  // untouched, so the UI can be restored at an /api/v1/docs path if wanted.

  await app.init();
  return expressApp;
}

function getApp(): Promise<Express> {
  // A failed boot must not be cached, or one bad cold start poisons the
  // instance for its entire lifetime.
  cachedApp ??= bootstrap().catch((error: unknown) => {
    cachedApp = null;
    throw error;
  });
  return cachedApp;
}

export async function handle(request: Request): Promise<Response> {
  const expressApp = await getApp();
  const req = await toNodeRequest(request);
  const captured = createCapturedResponse(req);

  expressApp(req, captured.res);
  await captured.finished;

  return toWebResponse(captured);
}
