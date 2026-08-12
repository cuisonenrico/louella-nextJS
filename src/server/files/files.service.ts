import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { MAX_UPLOAD_BYTES } from './files.constants';

@Injectable()
export class FilesService {
  private readonly s3: S3Client;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      },
    });
  }

  // Uses a presigned POST (not a presigned PUT) because S3's content-length-range
  // policy condition — the only reliable way to cap upload size before the object
  // lands in the bucket — is only enforced on the POST upload flow.
  async createPresignedUpload(
    userId: number,
    filename: string,
    contentType: string,
  ) {
    const bucket = this.config.getOrThrow<string>('S3_BUCKET_NAME');
    // Keep only the extension from the caller-supplied filename in the object key;
    // the original name is preserved separately via the `complete` step instead of
    // being baked into the key, so stray characters can't corrupt the S3 path.
    const safeExt = extname(filename)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '')
      .slice(0, 10);
    const key = `${userId}/${Date.now()}-${randomUUID()}${safeExt}`;

    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, MAX_UPLOAD_BYTES],
        ['eq', '$Content-Type', contentType],
      ],
      Fields: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment',
      },
      Expires: 60 * 5,
    });

    return { url, fields, key };
  }

  async completeUpload(userId: number, key: string, filename: string) {
    return this.prisma.file.create({
      data: {
        userId,
        s3Key: key,
        filename,
        status: 'UPLOADED',
      },
    });
  }
}
