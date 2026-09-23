import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { IDEMPOTENT_KEY } from '../decorators/idempotent.decorator';

/** Keys are client-generated UUIDs; anything else is refused rather than guessed at. */
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

/** How long a key is remembered. A retry comes seconds later, not days. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Makes `@Idempotent()` writes safe to resend.
 *
 * The client sends one `Idempotency-Key` per submission (per intent: the same
 * key for every attempt at the same form, a new one after it succeeds). The
 * key is **reserved before the handler runs** — a unique (user, key) row — so
 * of two identical requests racing, only one can book:
 *
 *   - first time            → run the handler, store its response
 *   - same key, same body   → replay the stored response, book nothing
 *   - same key, still running → 409 (the first attempt has not finished)
 *   - same key, other body  → 422 (a key must not be reused for a new request)
 *
 * If the handler fails, the reservation is released so a corrected retry can
 * go through. A request without the header behaves exactly as before.
 *
 * Registered globally (APP_INTERCEPTOR) and inert on handlers without the
 * decorator, like AutofillInterceptor.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return next.handle();

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id?: number } }>();
    const header = req.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) return next.handle();
    if (!KEY_FORMAT.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key must be 8–128 letters, digits, "-" or "_" (a UUID works).',
      );
    }

    // Keys are per user: another account reusing a string is a different key.
    const userId = req.user?.id;
    if (userId == null) return next.handle();

    const route = `${req.method} ${(req.route as { path?: string } | undefined)?.path ?? req.path}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ params: req.params ?? {}, body: req.body ?? null }))
      .digest('hex');
    const where = { userId_key: { userId, key } };

    // Opportunistic purge; indexed on createdAt, and a no-op most of the time.
    await this.prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });

    try {
      await this.prisma.idempotencyKey.create({
        data: { userId, key, route, requestHash },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
        throw err;
      }
      const seen = await this.prisma.idempotencyKey.findUnique({ where });
      if (!seen) {
        // Released between our insert and our read: the first attempt failed.
        throw new ConflictException('Please retry this request.');
      }
      if (seen.route !== route || seen.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          'This Idempotency-Key was already used for a different request.',
        );
      }
      if (seen.statusCode == null) {
        throw new ConflictException(
          'This request is already being processed. Wait for it to finish.',
        );
      }
      return of(seen.responseBody);
    }

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.prisma.idempotencyKey.update({
            where,
            data: {
              statusCode: req.method === 'POST' ? 201 : 200,
              // Stored exactly as the client would receive it.
              responseBody:
                body === undefined
                  ? Prisma.JsonNull
                  : (JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue),
            },
          }),
        ).pipe(mergeMap(() => of(body))),
      ),
      catchError((err: unknown) =>
        from(
          this.prisma.idempotencyKey.delete({ where }).catch(() => undefined),
        ).pipe(mergeMap(() => throwError(() => err))),
      ),
    );
  }
}
