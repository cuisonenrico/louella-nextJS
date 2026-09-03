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
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  // Every full page load spends one refresh, and the throttler keys on IP — so
  // a bakery behind one NAT pools this budget across all its staff. At 10/min
  // ordinary use tripped it: nine reloads, or two people working normally, and
  // the tenth request 429'd. Unlike login this is not a credential-guessing
  // surface — a caller must already hold a valid, unrevoked token — so the
  // limit only needs to bound load, not guessing.
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('refresh')
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bodyToken = body.refreshToken;
    const token = bodyToken ?? req.cookies?.refresh_token;
    if (!token) {
      throw new UnauthorizedException('Refresh token required');
    }
    const result = await this.authService.refresh(token);
    this.setRefreshCookie(res, result.refreshToken);

    // Only clients that authenticated with a token in the body get one back.
    //
    // The Flutter app has no cookie jar and round-trips the token itself, so
    // it must keep receiving it. A browser authenticates with the HttpOnly
    // cookie, and echoing the rotated 30-day token into a JS-readable body
    // would hand any XSS foothold a long-lived credential — defeating the
    // whole point of keeping it HttpOnly. The cookie above is the browser's
    // copy; it never needs to read one.
    if (!bodyToken) {
      const { refreshToken: _cookieOnly, ...rest } = result;
      return rest;
    }
    return result;
  }

  @Public()
  @Post('logout')
  async logout(
    @Body() body: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = body.refreshToken ?? req.cookies?.refresh_token;
    const result = await this.authService.logout(token);
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
  ) {
    return this.authService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  private setRefreshCookie(res: Response, token: string) {
    const cookieSameSite =
      process.env.COOKIE_SAME_SITE === 'strict' ||
      process.env.COOKIE_SAME_SITE === 'none'
        ? process.env.COOKIE_SAME_SITE
        : 'lax';

    const cookieSecure =
      process.env.COOKIE_SECURE != null
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production';

    res.cookie('refresh_token', token, {
      httpOnly: true,
      sameSite: cookieSameSite,
      secure: cookieSecure,
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    });

    // A readable companion flag saying only "a session cookie exists here".
    //
    // The refresh cookie is HttpOnly by design, so the browser cannot tell
    // whether it holds one. Without this hint every anonymous visitor to the
    // login and landing pages fired a refresh that could only ever 401 —
    // logging a console error and spending one of the 10/min budget before
    // they had typed a password. Carries no token and no identity.
    res.cookie('has_session', '1', {
      httpOnly: false,
      sameSite: cookieSameSite,
      secure: cookieSecure,
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie('refresh_token');
    res.clearCookie('has_session');
  }
}
