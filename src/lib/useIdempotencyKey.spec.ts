import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { idempotencyHeader, useIdempotencyKey } from './useIdempotencyKey';

describe('useIdempotencyKey', () => {
  it('keeps one key across re-renders, so a resend reuses it', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current[0];

    rerender();

    expect(result.current[0]).toBe(first);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('issues a fresh key once the submission has succeeded', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const first = result.current[0];

    act(() => result.current[1]());

    expect(result.current[0]).not.toBe(first);
  });
});

describe('idempotencyHeader', () => {
  it('sends the key as the Idempotency-Key header', () => {
    expect(idempotencyHeader('abc-12345')).toEqual({ headers: { 'Idempotency-Key': 'abc-12345' } });
  });

  it('adds nothing without a key', () => {
    expect(idempotencyHeader(undefined)).toBeUndefined();
  });
});
