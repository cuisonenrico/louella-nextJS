import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

/**
 * Authenticates Vercel Cron invocations.
 *
 * Vercel calls cron paths with `Authorization: Bearer <CRON_SECRET>`, which is
 * not a JWT — so these routes are `@Public()` (skipping JwtAuthGuard) and rely
 * on this guard instead. Without it a public GET could trigger a full
 * inventory autofill for anyone who guessed the URL.
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  private readonly logger = new Logger(CronSecretGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.CRON_SECRET;

    // Fail closed. A missing secret must never mean "allow everyone".
    if (!expected) {
      this.logger.error('CRON_SECRET is not set — refusing cron invocation.');
      throw new UnauthorizedException();
    }

    const header = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>().headers
      .authorization;

    const provided = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!provided || !safeEqual(provided, expected)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}

/** Constant-time comparison so the secret cannot be recovered byte by byte. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
