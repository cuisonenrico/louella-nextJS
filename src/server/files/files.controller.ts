import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { PresignDto } from './dto/presign.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  @UseGuards(JwtAuthGuard)
  async presign(@CurrentUser() user: { id: number }, @Body() body: PresignDto) {
    return this.filesService.createPresignedUpload(
      user.id,
      body.filename,
      body.contentType,
    );
  }

  // body.size is validated by PresignDto (rejects oversized requests early);
  // the actual size cap is enforced by S3 via the content-length-range policy
  // condition set in FilesService.createPresignedUpload.

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  async complete(
    @CurrentUser() user: { id: number },
    @Body() body: CompleteUploadDto,
  ) {
    return this.filesService.completeUpload(user.id, body.key, body.filename);
  }
}
