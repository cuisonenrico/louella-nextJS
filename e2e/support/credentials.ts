import { loadE2eEnv } from './env';

const env = loadE2eEnv();

export const KITCHEN_BRANCH_ID = 1;
export const ADMIN = { email: 'e2e-admin@louella.test', password: env.E2E_ADMIN_PASSWORD };
export const MANAGER = { email: 'e2e-manager@louella.test', password: env.E2E_MANAGER_PASSWORD };
export const VIEWER = { email: 'e2e-viewer@louella.test', password: env.E2E_MANAGER_PASSWORD };
export const STATE = { admin: 'e2e/.auth/admin.json', manager: 'e2e/.auth/manager.json' };
