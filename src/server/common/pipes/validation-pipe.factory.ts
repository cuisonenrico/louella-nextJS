import { ValidationPipe } from '@nestjs/common';
import { ScopedValidationPipe } from './scoped-validation.pipe';

/** The app's validation pipe. One place, so production and the HTTP-level specs run the same options. */
export function createValidationPipe(): ValidationPipe {
  return new ScopedValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
}
