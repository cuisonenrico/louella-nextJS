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

  it('clears with the same domain and path the cookies were set with', async () => {
    // A browser ignores a clear whose domain does not match, so without these
    // options logout left both cookies behind whenever COOKIE_DOMAIN was set.
    const previous = process.env.COOKIE_DOMAIN;
    process.env.COOKIE_DOMAIN = '.louella.example';
    try {
      const authService = {
        logout: jest.fn().mockResolvedValue({ success: true }),
      } as never;
      const controller = new AuthController(authService);
      const res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;

      await controller.logout({} as never, { cookies: {} } as never, res);

      for (const [, opts] of (res as unknown as { clearCookie: jest.Mock })
        .clearCookie.mock.calls) {
        expect(opts.domain).toBe('.louella.example');
        expect(opts.path).toBe('/');
      }
    } finally {
      if (previous === undefined) delete process.env.COOKIE_DOMAIN;
      else process.env.COOKIE_DOMAIN = previous;
    }
  });
});

describe('AuthController.login — who gets the refresh token back', () => {
  function makeLoginController() {
    const authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        refreshTokenId: 1,
        user: { id: 1 },
      }),
    } as never;
    const controller = new AuthController(authService);
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;
    return { controller, res };
  }
  const body = { email: 'a@b.com', password: 'password' } as never;

  it.each([
    ['sec-fetch-mode', { 'sec-fetch-mode': 'cors' }],
    ['origin', { origin: 'https://louella.example' }],
  ])('omits it for a browser (%s header)', async (_name, headers) => {
    const { controller, res } = makeLoginController();

    const result = await controller.login(body, { headers } as never, res);

    expect(result).not.toHaveProperty('refreshToken');
    expect(result.accessToken).toBe('access');
  });

  it('returns it to a client without browser headers (the mobile app)', async () => {
    const { controller, res } = makeLoginController();

    const result: Record<string, unknown> = await controller.login(
      body,
      { headers: { 'user-agent': 'Dart/3.5 (dart:io)' } } as never,
      res,
    );

    expect(result.refreshToken).toBe('refresh');
  });
});
