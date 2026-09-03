import { test, expect, Page } from '@playwright/test';
import { ADMIN } from './routes';

const TAG = `QA-AUDIT-${Date.now()}`;   // marker so any leftover row is identifiable

async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
}

async function load(page: Page, route: string) {
  const done = page.waitForResponse((r) => r.url().includes('/auth/refresh'), { timeout: 30_000 }).catch(() => null);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await done;
  await page.waitForTimeout(3000);
}

test('login negative paths', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. empty submit
  await page.goto('/login');
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForTimeout(1500);
  const stillLogin = new URL(page.url()).pathname === '/login';
  const emailInvalid = await page.locator('input[type="email"]:invalid').count();
  console.log(`empty submit: stayed on /login=${stillLogin} nativeValidation=${emailInvalid > 0}`);

  // 2. wrong password
  await login(page, ADMIN.email, 'WrongPassword!123');
  await page.waitForTimeout(3000);
  const txt = (await page.locator('body').innerText()).trim();
  const shows = /invalid|incorrect|wrong|credential|failed/i.test(txt);
  console.log(`wrong password: errorShown=${shows} path=${new URL(page.url()).pathname}`);
  console.log(`   message: ${(txt.match(/.{0,80}(invalid|incorrect|credential|failed).{0,60}/i) || ['<none>'])[0].replace(/\s+/g,' ')}`);
  await page.screenshot({ path: 'e2e-results/screens/flow-login-wrongpw.png', fullPage: true });
  await ctx.close();
});

test('product create -> validation -> double-submit -> cleanup', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/v1/products')) posts.push(r.url());
  });

  await login(page);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  await load(page, '/products');

  // --- validation: submit the create form with an empty name
  await page.getByRole('button', { name: /add product/i }).click();
  await page.waitForTimeout(800);
  const saveBtn = page.getByRole('button', { name: /^(save|create|add)$/i }).last();
  await saveBtn.click();
  await page.waitForTimeout(1200);
  const dialogTxt = (await page.locator('[role="dialog"]').innerText().catch(() => '')).trim();
  console.log(`empty-name validation: message shown = ${/required/i.test(dialogTxt)} | "${(dialogTxt.match(/[^\n]*required[^\n]*/i)||['<none>'])[0]}"`);
  console.log(`   POSTs fired by invalid submit: ${posts.length} (expected 0)`);

  // --- double-submit: fill valid data, click Save twice fast
  await page.locator('[role="dialog"] input').first().fill(`${TAG}-widget`);
  const priceInput = page.locator('[role="dialog"] input[type="number"]').first();
  await priceInput.fill('12.50');
  const before = posts.length;
  await saveBtn.click({ clickCount: 2, delay: 40 });
  await page.waitForTimeout(6000);
  console.log(`double-click Save: POSTs fired = ${posts.length - before} (expected 1)`);
  await page.screenshot({ path: 'e2e-results/screens/flow-product-created.png', fullPage: true });

  // --- verify it exists, then clean up
  await load(page, '/products');
  await page.getByPlaceholder(/search products/i).fill(TAG);
  await page.waitForTimeout(1500);
  const rows = await page.locator('tbody tr').count();
  console.log(`created product visible in list: rows matching ${TAG} = ${rows}`);

  if (rows > 0) {
    const del = page.locator('tbody tr').first().getByRole('button').last();
    await del.click();
    await page.waitForTimeout(800);
    const confirm = page.getByRole('button', { name: /delete|confirm|yes/i }).last();
    await confirm.click();
    await page.waitForTimeout(4000);
    await page.getByPlaceholder(/search products/i).fill(TAG);
    await page.waitForTimeout(1500);
    const after = await page.locator('tbody tr').count();
    console.log(`CLEANUP: rows matching ${TAG} after delete = ${after}`);
  }
  console.log(`TEST MARKER USED: ${TAG}`);
  await ctx.close();
});
