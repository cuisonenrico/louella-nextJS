import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Marks a write endpoint as honouring the `Idempotency-Key` request header
 * (see IdempotencyInterceptor): a resend of the same submission replays the
 * first response instead of booking a second time.
 *
 * Only for writes that *add* — a pull-out, a transfer, a new order. Absolute
 * writes (a sheet save that sets a count) are already safe to repeat.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
