import { Module } from '@nestjs/common';
import { LandingAdminController, LandingPublicController } from './landing.controller';
import { LandingService } from './landing.service';
import { LandingStorage } from './landing-storage';

@Module({
  controllers: [LandingPublicController, LandingAdminController],
  providers: [LandingService, LandingStorage],
})
export class LandingModule {}
