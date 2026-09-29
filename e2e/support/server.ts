type Creds = { email: string; password: string };
type LoginFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;

/**
 * `reuseExistingServer` accepts ANY process already listening on the port — for example a plain
 * `next start` that loaded `.env` (production). The database guards cannot see that, because they
 * only check what we configure, not what is actually serving. The seeded e2e admin exists only in the
 * e2e database, so if it can log in through this server, the server is connected to the e2e database.
 */
export async function assertE2eServer(
  baseURL: string,
  admin: Creds,
  doFetch: LoginFetch = fetch as unknown as LoginFetch,
): Promise<void> {
  const fail = (why: string) =>
    new Error(
      `[e2e] The server at ${baseURL} is not the e2e server (${why}). Something else may be listening on that ` +
        'port — e.g. a `next start` that loaded .env, which is production. Stop it and rerun.',
    );
  let res: { ok: boolean; status: number };
  try {
    res = await doFetch(`${baseURL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(admin),
    });
  } catch (err) {
    throw fail(`no answer: ${(err as Error).message}`);
  }
  if (!res.ok) throw fail(`the seeded e2e admin cannot log in: HTTP ${res.status}`);
}
