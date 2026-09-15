import { generateKeyPairSync } from 'crypto';
import { NotificationsService } from './notifications.service';

/**
 * Guards the firebase-admin integration against API drift. Version 14 removed
 * the namespaced API this service used, and because initialisation swallows
 * errors, the break showed up only as push notifications quietly turning off.
 */
describe('NotificationsService with firebase-admin', () => {
  const previous = process.env.FIREBASE_SERVICE_ACCOUNT;

  afterEach(async () => {
    if (previous === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = previous;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApps, deleteApp } = require('firebase-admin/app');
    await Promise.all(getApps().map(deleteApp));
  });

  function fakeServiceAccount() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return JSON.stringify({
      type: 'service_account',
      project_id: 'louella-test',
      client_email: 'test@louella-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
  }

  it('initialises an app from an inline service account', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccount();
    const service = new NotificationsService({} as never);

    expect((service as unknown as { firebaseApp: unknown }).firebaseApp).not.toBeNull();
  });

  it('reuses the existing app instead of initialising twice', () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccount();
    const first = new NotificationsService({} as never);
    const second = new NotificationsService({} as never);

    expect((second as unknown as { firebaseApp: unknown }).firebaseApp).toBe(
      (first as unknown as { firebaseApp: unknown }).firebaseApp,
    );
  });

  it('stays disabled without credentials', () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    const service = new NotificationsService({} as never);

    expect((service as unknown as { firebaseApp: unknown }).firebaseApp).toBeNull();
  });
});
