import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsPositive } from 'class-validator';
import { IMAGE_TYPES } from '../landing-storage';

/**
 * `content` is validated by the shared Zod schema in LandingService — the
 * nested shape is too deep for class-validator and must match the editor's.
 */
export class SaveLandingDraftDto {
  @IsObject()
  content: Record<string, unknown>;

  /** The draftUpdatedAt the editor loaded; guards against lost updates. */
  @IsOptional()
  @IsISO8601()
  baseUpdatedAt?: string;
}

export class LandingUploadUrlDto {
  @IsIn(Object.keys(IMAGE_TYPES))
  contentType: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  size: number;
}
