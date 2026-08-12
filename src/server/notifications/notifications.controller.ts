import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/user.decorator';
import { RegisterTokenDto } from './dto/register-token.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Registers (or updates) a device FCM token for the currently authenticated user.
   * Called from the web/mobile client after obtaining a Firebase Cloud Messaging token.
   */
  @Post('register')
  async register(
    @Body() dto: RegisterTokenDto,
    @CurrentUser() user: { id: number },
  ) {
    await this.notificationsService.registerToken(user.id, dto);
    return { message: 'Token registered.' };
  }

  /**
   * Removes a specific FCM token (e.g., on logout or permission revoke).
   * Only the owning user's token is deleted; silently succeeds for non-matching tokens.
   */
  @Delete('token/:token')
  async remove(
    @Param('token') token: string,
    @CurrentUser() user: { id: number },
  ) {
    await this.notificationsService.removeToken(token, user.id);
    return { message: 'Token removed.' };
  }
}
