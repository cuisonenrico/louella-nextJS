/**
 * Landing images in Supabase Storage (public bucket `landing`).
 *
 * The service-role key never leaves the server: an admin asks for a signed
 * upload URL, the browser PUTs the file straight to Supabase, and only the
 * resulting public URL is saved in the landing content. Talks to the Storage
 * REST API with fetch, so no Supabase SDK is bundled.
 */
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export const LANDING_BUCKET = 'landing';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class LandingStorage {
  private readonly logger = new Logger(LandingStorage.name);
  private bucketReady: Promise<void> | null = null;

  private config(): { url: string; key: string } {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      throw new ServiceUnavailableException(
        'Image uploads are not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return { url, key };
  }

  /** Public URL prefix every stored landing image starts with, or null if unconfigured. */
  publicPrefix(): string | null {
    const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
    return url ? `${url}/storage/v1/object/public/${LANDING_BUCKET}/` : null;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const { url, key } = this.config();
    return fetch(`${url}/storage/v1${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
  }

  /** Creates the public bucket on first use; memoised per instance. */
  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const existing = await this.request(`/bucket/${LANDING_BUCKET}`);
      if (existing.ok) return;
      const created = await this.request('/bucket', {
        method: 'POST',
        body: JSON.stringify({
          id: LANDING_BUCKET,
          name: LANDING_BUCKET,
          public: true,
          file_size_limit: MAX_IMAGE_BYTES,
          allowed_mime_types: Object.keys(IMAGE_TYPES),
        }),
      });
      // 409: another instance created it between our check and create.
      if (!created.ok && created.status !== 409) {
        const body = await created.text();
        if (!/already exists/i.test(body)) {
          throw new Error(`Could not create storage bucket (${created.status}): ${body.slice(0, 200)}`);
        }
      }
    })().catch((err: unknown) => {
      this.bucketReady = null;
      throw err;
    });
    return this.bucketReady;
  }

  async createUploadUrl(contentType: string, size: number) {
    const ext = IMAGE_TYPES[contentType];
    if (!ext) throw new BadRequestException('Upload a JPG, PNG or WebP image.');
    if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Images must be 8 MB or smaller.');
    }

    try {
      await this.ensureBucket();
    } catch (err) {
      this.logger.error(err instanceof Error ? err.message : String(err));
      throw new ServiceUnavailableException('Image storage is unavailable. Check the Supabase settings.');
    }

    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    const path = `${day}/${randomUUID()}.${ext}`;
    const res = await this.request(`/object/upload/sign/${LANDING_BUCKET}/${path}`, { method: 'POST', body: '{}' });
    if (!res.ok) {
      this.logger.error(`Signed upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      throw new ServiceUnavailableException('Could not start the upload. Try again.');
    }
    const { url: signedPath } = (await res.json()) as { url: string };
    const { url } = this.config();
    return {
      uploadUrl: `${url}/storage/v1${signedPath}`,
      publicUrl: `${this.publicPrefix()}${path}`,
      path,
    };
  }
}
