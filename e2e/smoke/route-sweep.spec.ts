import { test, expect } from '../fixtures/test';
import { buildWorld } from '../fixtures/world';
import { previousCutoff } from '../fixtures/dates';
import { dynamicRoutes, PUBLIC_ROUTES, STATIC_ROUTES } from '../routes';

// Signed-in admin visits every page: no error boundary, no failed data call, no 5xx.
test.describe('route sweep @smoke', () => {
  test('every route renders without an error or a 5xx', async ({ api, page }) => {
    test.setTimeout(240_000);
    const world = await buildWorld(api, { employees: 1 });
    const routes = [
      ...PUBLIC_ROUTES,
      ...STATIC_ROUTES,
      ...dynamicRoutes({ employeeId: world.employees[0].id, periodStart: previousCutoff().periodStart }),
    ];

    const failures: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/v1/') && r.status() >= 500) failures.push(`${r.status()} ${r.url()}`);
    });

    for (const route of routes) {
      await test.step(route, async () => {
        const failedBefore = failures.length;
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        // app/error.tsx and global-error.tsx
        await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
        // components/QueryError.tsx — a page's own data call failed
        await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
        // Something real rendered. /change-password has an <h1> but no <main>.
        await expect(page.locator('main, [role="main"], h1').first()).toBeVisible();
        expect(failures.slice(failedBefore), `5xx while loading ${route}`).toEqual([]);
      });
    }
  });
});
