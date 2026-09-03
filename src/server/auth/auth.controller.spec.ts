import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * The refresh endpoint serves two clients with different threat models.
 *
 * A browser authenticates with the HttpOnly cookie and must never see the
 * rotated token in a JS-readable body — that would hand any XSS foothold a
 * 30-day credential and undo the whole reason the cookie is HttpOnly. The
 * Flutter app has no cookie jar, round-trips the token itself, and must keep
 * receiving it.
 */
function makeController() {
  const rotated = {
    accessToken: 'new-access',
    refreshToken: 'new-refresh',
    refreshTokenId: 42,
    user: { id: 1, email: 'a@b.com' },
  };
  const authService = { refresh: jest.fn().mockResolvedValue(rotated) } as never;
  const controller = new AuthController(authService);
  const res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;
  return { controller, res, rotated };
}

describe('AuthController.refresh — who gets the refresh token back', () => {
  it('omits it when the caller authenticated with the cookie', async () => {
    const { controller, res } = makeController();
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    const result = await controller.refresh({} as never, req, res);

    expect(result).not.toHaveProperty('refreshToken');
    expect(result.accessToken).toBe('new-access');
  });

  it('still sets the rotated token as a cookie for that caller', async () => {
    const { controller, res } = makeController();
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    await controller.refresh({} as never, req, res);

    const [name, value, opts] = (res as unknown as { cookie: jest.Mock }).cookie
      .mock.calls[0];
    expect(name).toBe('refresh_token');
    expect(value).toBe('new-refresh');
    expect(opts.httpOnly).toBe(true);
  });

  it('returns it when the caller sent one in the body (the mobile client)', async () => {
    const { controller, res } = makeController();
    const req = { cookies: {} } as never;

    // The return type is a union — present on the body-auth path, absent on
    // the cookie path — so read it as a record rather than narrowing here.
    const result: Record<string, unknown> = await controller.refresh(
      { refreshToken: 'body-token' } as never,
      req,
      res,
    );

    expect(result.refreshToken).toBe('new-refresh');
  });

  it('rejects a caller with neither', async () => {
    const { controller, res } = makeController();
    const req = { cookies: {} } as never;

    await expect(
      controller.refresh({} as never, req, res),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthController — session hint cookie', () => {
  it('sets a readable has_session flag alongside the HttpOnly token', async () => {
    // Lets the client skip a refresh it knows will 401, instead of firing one
    // for every anonymous visitor to the login page.
    const { controller, res } = makeController();
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    await controller.refresh({} as never, req, res);

    const calls = (res as unknown as { cookie: jest.Mock }).cookie.mock.calls;
    const hint = calls.find(([name]) => name === 'has_session');
    expect(hint).toBeDefined();
    expect(hint![1]).toBe('1');
    expect(hint![2].httpOnly).toBe(false);
  });

  it('clears both cookies on logout', async () => {
    const authService = {
      logout: jest.fn().mockResolvedValue({ success: true }),
    } as never;
    const controller = new AuthController(authService);
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    await controller.logout({} as never, req, res);

    const cleared = (res as unknown as { clearCookie: jest.Mock }).clearCookie.mock.calls.map(
      ([name]) => name,
    );
    expect(cleared).toEqual(
      expect.arrayContaining(['refresh_token', 'has_session']),
    );
  });
});
