import { randomBytes } from 'node:crypto';

/** A short unique tag, so names never collide across parallel tests and repeats. */
export const tag = (): string => randomBytes(3).toString('hex');

/** `E2E-7f3a9c Bread` — unique, and easy to search for in a list that holds every test's rows. */
export const uniqueName = (label: string): string => `E2E-${tag()} ${label}`;
