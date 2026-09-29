import { throttleLimit } from './throttle-limits';

describe('throttleLimit', () => {
  it('returns the default when the flag is unset', () => {
    expect(throttleLimit(20, {})).toBe(20);
    expect(throttleLimit(5, {})).toBe(5);
  });

  it('returns the default for any value other than "1"', () => {
    expect(throttleLimit(20, { E2E_RELAX_THROTTLE: 'true' })).toBe(20);
    expect(throttleLimit(20, { E2E_RELAX_THROTTLE: '' })).toBe(20);
  });

  it('relaxes to 10 000 when E2E_RELAX_THROTTLE=1', () => {
    expect(throttleLimit(20, { E2E_RELAX_THROTTLE: '1' })).toBe(10_000);
  });
});
