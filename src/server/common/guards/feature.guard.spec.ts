import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureGuard } from './feature.guard';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardRequiring(required: string[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new FeatureGuard(reflector);
}

describe('FeatureGuard', () => {
  it('allows a handler that declares no feature', () => {
    // The read-open default: adding the guard globally must not lock anyone out
    // of endpoints nobody deliberately annotated.
    expect(guardRequiring(undefined).canActivate(contextFor({ permissions: [] }))).toBe(true);
    expect(guardRequiring([]).canActivate(contextFor({ permissions: [] }))).toBe(true);
  });

  it('allows a user holding the required feature', () => {
    const guard = guardRequiring(['products']);
    expect(guard.canActivate(contextFor({ permissions: ['products', 'recipes'] }))).toBe(true);
  });

  it('rejects a user without the required feature', () => {
    const guard = guardRequiring(['products']);
    expect(() => guard.canActivate(contextFor({ permissions: ['recipes'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('treats several keys as ANY, not ALL', () => {
    // /materials/low-stock is annotated with both `materials` and `low-stock`
    // so the mobile low-stock screen keeps working for INVENTORY, which holds
    // only the latter.
    const guard = guardRequiring(['materials', 'low-stock']);
    expect(guard.canActivate(contextFor({ permissions: ['low-stock'] }))).toBe(true);
  });

  it('rejects when the request has no user at all', () => {
    const guard = guardRequiring(['products']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('rejects when the user carries no permissions array', () => {
    const guard = guardRequiring(['products']);
    expect(() => guard.canActivate(contextFor({ id: 1 }))).toThrow(ForbiddenException);
  });

  it('names the feature in the error so the cause is diagnosable', () => {
    const guard = guardRequiring(['user-management']);
    expect(() => guard.canActivate(contextFor({ permissions: [] }))).toThrow(
      /User Management/,
    );
  });
});
