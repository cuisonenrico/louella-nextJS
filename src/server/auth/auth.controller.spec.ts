import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

/**
 * The refresh token lives only in the HttpOnly cookie. It must never appear in
 * a JS-readable body — that would hand any XSS foothold a 30-day credential and
 * undo the whole reason the cookie is HttpOnly.
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

describe('AuthController.refresh — the token stays in the cookie', () => {
  it('omits it from the body', async () => {
    const { controller, res } = makeController();
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    const result = await controller.refresh(req, res);

    expect(result).not.toHaveProperty('refreshToken');
    expect(result.accessToken).toBe('new-access');
  });

  it('sets the rotated token as an HttpOnly cookie', async () => {
    const { controller, res } = makeController();
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    await controller.refresh(req, res);

    const [name, value, opts] = (res as unknown as { cookie: jest.Mock }).cookie
      .mock.calls[0];
    expect(name).toBe('refresh_token');
    expect(value).toBe('new-refresh');
    expect(opts.httpOnly).toBe(true);
  });

  it('ignores a token sent in the body', async () => {
    // The body-token path served the Flutter app, which is gone. A token in
    // the body alone must not authenticate.
    const { controller, res } = makeController();
    const req = { cookies: {}, body: { refreshToken: 'body-token' } } as never;

    await expect(controller.refresh(req, res)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('AuthController — session hint cookie', () => {
  it('sets a readable has_session flag alongside the HttpOnly token', async () => {
    // Lets the client skip a refresh it knows will 401, instead of firing one
    // for every anonymous visitor to the login page.
    const { controller, res } = makeController();
    const req = { cookies: { refresh_token: 'cookie-token' } } as never;

    await controller.refresh(req, res);

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

    await controller.logout(req, res);

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

      await controller.logout({ cookies: {} } as never, res);

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

describe('AuthController.login — the token stays in the cookie', () => {
  it('sets it as a cookie and omits it from the body', async () => {
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

    const result = await controller.login(
      { email: 'a@b.com', password: 'password' } as never,
      res,
    );

    expect(result).not.toHaveProperty('refreshToken');
    expect(result.accessToken).toBe('access');
    const [name, value] = (res as unknown as { cookie: jest.Mock }).cookie.mock.calls[0];
    expect(name).toBe('refresh_token');
    expect(value).toBe('refresh');
  });
});
