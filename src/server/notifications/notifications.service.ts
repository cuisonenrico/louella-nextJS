import * as fs from 'fs';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTokenDto } from './dto/register-token.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: any = null;

  constructor(private readonly prisma: PrismaService) {
    this.initFirebase();
  }

  private initFirebase() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountJson && !serviceAccountPath) {
      this.logger.warn(
        'Neither FIREBASE_SERVICE_ACCOUNT nor FIREBASE_SERVICE_ACCOUNT_PATH is set — push notifications disabled.',
      );
      return;
    }
    try {
      // Lazy-require so the build does not fail when firebase-admin is absent
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const admin = require('firebase-admin');

      let credential: any;
      if (serviceAccountJson) {
        // Cloud Run: secret value injected directly as JSON string
        credential = admin.credential.cert(JSON.parse(serviceAccountJson));
      } else {
        // Local dev: path to service account JSON file
        credential = admin.credential.cert(
          JSON.parse(fs.readFileSync(serviceAccountPath!, 'utf8')),
        );
      }

      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({ credential });
      } else {
        this.firebaseApp = admin.apps[0];
      }
      this.logger.log('Firebase Admin SDK initialised.');
    } catch (err) {
      this.logger.error('Failed to init Firebase Admin SDK', err);
    }
  }

  async registerToken(userId: number, dto: RegisterTokenDto): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId,
        platform: dto.platform ?? 'web',
        updatedAt: new Date(),
      },
      create: { userId, token: dto.token, platform: dto.platform ?? 'web' },
    });
  }

  async removeToken(token: string, userId: number): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
  }

  /**
   * Sends a push notification to all registered devices for a given user.
   * No-ops if Firebase is not configured.
   */
  async sendToUser(
    userId: number,
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<void> {
    if (!this.firebaseApp) return;

    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (!tokens.length) return;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');

    const message = {
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      tokens: tokens.map((t) => t.token),
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    this.logger.log(
      `Sent notification to user ${userId}: ${response.successCount} ok, ${response.failureCount} failed.`,
    );
  }
}
