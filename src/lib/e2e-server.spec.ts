import { describe, expect, it, vi } from 'vitest';
import { assertE2eServer } from '../../e2e/support/server';

const creds = { email: 'e2e-admin@louella.test', password: 'pw' };
const respond = (status: number) => vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status });

describe('assertE2eServer', () => {
  it('passes when the seeded e2e admin can log in', async () => {
    const doFetch = respond(201);
    await expect(assertE2eServer('http://localhost:4100', creds, doFetch)).resolves.toBeUndefined();
    expect(doFetch).toHaveBeenCalledWith(
      'http://localhost:4100/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(creds) }),
    );
  });

  it('refuses a server where the e2e admin does not exist (e.g. one connected to another database)', async () => {
    await expect(assertE2eServer('http://localhost:4100', creds, respond(401))).rejects.toThrow(/not the e2e server/);
  });

  it('refuses when nothing answers', async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(assertE2eServer('http://localhost:4100', creds, doFetch)).rejects.toThrow(/not the e2e server/);
  });
});
