import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { throttleLimit } from '../common/config/throttle-limits';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: throttleLimit(5) } })
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);
    this.setRefreshCookie(res, result.refreshToken);
    return withoutRefreshToken(result);
  }

  // Every full page load spends one refresh, and the throttler keys on IP — so
  // a bakery behind one NAT pools this budget across all its staff. At 10/min
  // ordinary use tripped it: nine reloads, or two people working normally, and
  // the tenth request 429'd. Unlike login this is not a credential-guessing
  // surface — a caller must already hold a valid, unrevoked token — so the
  // limit only needs to bound load, not guessing.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: throttleLimit(60) } })
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies?.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token required');
    }
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(res, result.refreshToken);
    return withoutRefreshToken(result);
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logout(req.cookies?.refresh_token);
    this.clearAuthCookies(res);
    return result;
  }

  // Returns the effective feature permissions alongside the profile. JwtStrategy
  // has already resolved them as part of the auth lookup, so folding them in
  // here costs nothing and saves the client a second round trip on every load.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser()
    user: { id: number; email: string; role: string; permissions: string[] },
  ) {
    const profile = await this.authService.me(user.id);
    return { ...profile, permissions: user.permissions };
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: { id: number },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Changing the password revokes every refresh token, the caller's
    // included, and hands back a replacement for this session alone.
    const result = await this.authService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    this.setRefreshCookie(res, result.refreshToken);
    return withoutRefreshToken(result);
  }

  private setRefreshCookie(res: Response, token: string) {
    const options = cookieOptions();

    res.cookie('refresh_token', token, { ...options, httpOnly: true });

    // A readable companion flag saying only "a session cookie exists here".
    //
    // The refresh cookie is HttpOnly by design, so the browser cannot tell
    // whether it holds one. Without this hint every anonymous visitor to the
    // login and landing pages fired a refresh that could only ever 401 —
    // logging a console error and spending one of the 10/min budget before
    // they had typed a password. Carries no token and no identity.
    res.cookie('has_session', '1', { ...options, httpOnly: false });
  }

  // A browser only deletes a cookie whose domain and path match the ones it
  // was set with. Clearing without them left both cookies behind whenever
  // COOKIE_DOMAIN was configured, so logout did not actually log out.
  private clearAuthCookies(res: Response) {
    const options = cookieOptions();
    res.clearCookie('refresh_token', { ...options, httpOnly: true });
    res.clearCookie('has_session', { ...options, httpOnly: false });
  }
}

function cookieOptions() {
  const sameSite: 'lax' | 'strict' | 'none' =
    process.env.COOKIE_SAME_SITE === 'strict' ||
    process.env.COOKIE_SAME_SITE === 'none'
      ? process.env.COOKIE_SAME_SITE
      : 'lax';

  const secure =
    process.env.COOKIE_SECURE != null
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';

  return {
    sameSite,
    secure,
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

/**
 * Drop the refresh token from a response body.
 *
 * The browser holds its copy in the HttpOnly cookie. Echoing the 30-day token
 * into a JS-readable body would hand any XSS foothold a long-lived credential
 * and defeat the point of the cookie.
 */
function withoutRefreshToken<T extends { refreshToken: string }>(
  result: T,
): Omit<T, 'refreshToken'> {
  const { refreshToken: _cookieOnly, ...rest } = result;
  return rest;
}
