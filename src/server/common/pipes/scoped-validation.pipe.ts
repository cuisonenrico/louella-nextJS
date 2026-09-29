import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import { PINNED_BRANCH_QUERY } from '../guards/branch.guard';

/**
 * ValidationPipe that tolerates the `branchId` BranchGuard stamps into `req.query` for a
 * branch-confined user.
 *
 * The app validates with `forbidNonWhitelisted`, so a query DTO that does not declare `branchId`
 * rejected that stamp — `400 "property branchId should not exist"` — and a branch manager could not
 * load their own daily sheet. The stamp is the guard's own (it already refused any other branch
 * with a 403), so for a DTO that does not declare the field it is left out of validation.
 *
 * Only the guard's stamp is exempt: the marker is set by the guard alone, so a `branchId` that an
 * unscoped user sends still fails on a DTO without it, and a DTO that DOES declare `branchId`
 * still receives and validates the value.
 */
export class ScopedValidationPipe extends ValidationPipe {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (
      metadata.type === 'query' &&
      metadata.data === undefined &&
      isPinnedQuery(value) &&
      !declaresBranchId(metadata.metatype)
    ) {
      const { branchId: _stamped, ...rest } = value;
      void _stamped;
      return super.transform(rest, metadata);
    }
    return super.transform(value, metadata);
  }
}

function isPinnedQuery(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[PINNED_BRANCH_QUERY] === true;
}

function declaresBranchId(metatype: ArgumentMetadata['metatype']): boolean {
  if (typeof metatype !== 'function') return false;
  return getMetadataStorage()
    .getTargetValidationMetadatas(metatype, undefined as unknown as string, false, false)
    .some((m) => m.propertyName === 'branchId');
}
