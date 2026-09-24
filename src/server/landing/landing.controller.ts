import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LandingService } from './landing.service';
import { LandingUploadUrlDto, SaveLandingDraftDto } from './dto/landing.dto';

type Actor = { id: number };

/** The published page, for anyone. The site itself renders server-side. */
@Controller('landing')
export class LandingPublicController {
  constructor(private readonly landing: LandingService) {}

  @Public()
  @Get()
  getPublished() {
    return this.landing.getPublished();
  }
}

/** The editor. Admin-only at the class level, like payroll. */
@Controller('landing/admin')
@Roles(UserRole.ADMIN)
@RequireFeature('landing')
export class LandingAdminController {
  constructor(private readonly landing: LandingService) {}

  @Get('draft')
  getDraft() {
    return this.landing.getDraft();
  }

  @Put('draft')
  saveDraft(@Body() dto: SaveLandingDraftDto, @CurrentUser() user: Actor) {
    return this.landing.saveDraft(dto.content, dto.baseUpdatedAt, user.id);
  }

  @Post('draft/discard')
  @HttpCode(200)
  discardDraft(@CurrentUser() user: Actor) {
    return this.landing.discardDraft(user.id);
  }

  @Post('publish')
  @HttpCode(200)
  publish(@CurrentUser() user: Actor) {
    return this.landing.publish(user.id);
  }

  @Get('revisions')
  listRevisions() {
    return this.landing.listRevisions();
  }

  @Post('revisions/:id/restore')
  @HttpCode(200)
  restore(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.landing.restoreRevision(id, user.id);
  }

  @Post('images/upload-url')
  @HttpCode(200)
  uploadUrl(@Body() dto: LandingUploadUrlDto) {
    return this.landing.createUploadUrl(dto.contentType, dto.size);
  }
}
