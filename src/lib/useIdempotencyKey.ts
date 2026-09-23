import { useCallback, useState } from 'react';

/**
 * One Idempotency-Key per *intent* — the same key for every attempt at the
 * same submission, a fresh one once it has succeeded.
 *
 * The API books an @Idempotent() write at most once per key (see the server's
 * IdempotencyInterceptor), so a double click, or a resend after a lost
 * response, cannot add a second pull-out or transfer. A new key per request
 * would defeat that: each resend would look like a new submission.
 */
export function useIdempotencyKey(): [key: string, renew: () => void] {
  const [key, setKey] = useState(newIdempotencyKey);
  const renew = useCallback(() => setKey(newIdempotencyKey()), []);
  return [key, renew];
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Axios request config carrying the key, or nothing when there is none. */
export function idempotencyHeader(key?: string) {
  return key ? { headers: { 'Idempotency-Key': key } } : undefined;
}
