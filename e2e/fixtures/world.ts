import { randomBytes } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import type { Api } from './api';
import { addDays, today } from './dates';
import { loadE2eEnv } from '../support/env';

export interface WorldOptions {
  products?: number; // default 2
  withRecipe?: boolean; // default false — material + recipe for products[0]
  employees?: number; // default 0
  hireDate?: string; // default today()
  dailyRate?: number; // default 600
  restDays?: number[]; // default [0] (Sunday)
  recurringDeduction?: number; // monthly amount on each employee (payroll spec)
}

export interface World {
  id: string; // short unique tag, e.g. "7f3a9c"
  branch: { id: number; name: string };
  manager: { id: number; email: string; password: string };
  products: Array<{ id: number; name: string; price: number }>;
  material?: { id: number; name: string; unit: 'G' };
  recipe?: { id: number; gramsPerUnit: number }; // grams of material per 1 product unit
  employees: Array<{ id: number; firstName: string; lastName: string; dailyRate: number; restDays: number[] }>;
}

const PASSWORD = loadE2eEnv().E2E_MANAGER_PASSWORD;

/**
 * Builds an isolated world through the API as admin: its own branch, manager,
 * products (with price history), and optionally a recipe and employees.
 * Names carry a short unique id so parallel and repeated runs never collide.
 */
export async function buildWorld(api: Api, opts: WorldOptions = {}): Promise<World> {
  const id = randomBytes(3).toString('hex');
  const tag = (s: string) => `E2E-${id} ${s}`;

  const branch = await api.post<{ id: number; name: string }>('/branches', {
    name: tag('Branch'),
    isActive: true,
  });

  const email = `e2e-${id}@louella.test`;
  const manager = await api.post<{ id: number }>('/users', {
    email,
    password: PASSWORD,
    role: 'MANAGER',
    branchId: branch.id,
    mustChangePassword: false,
  });

  // Launch date before yesterday so the product has a price on every day tests touch.
  const launched = addDays(today(), -30);
  const products: World['products'] = [];
  for (let i = 0; i < (opts.products ?? 2); i++) {
    const price = 10 + i * 5;
    const p = await api.post<{ id: number; name: string }>('/products', {
      name: tag(`Bread ${i + 1}`),
      type: 'BREAD',
      price,
      date: launched,
      isActive: true,
    });
    products.push({ id: p.id, name: p.name, price });
  }

  let material: World['material'];
  let recipe: World['recipe'];
  if (opts.withRecipe) {
    const m = await api.post<{ id: number; name: string }>('/materials', {
      name: tag('Flour'),
      unit: 'G',
      pricePerUnit: 0.05,
    });
    material = { id: m.id, name: m.name, unit: 'G' };
    const gramsPerUnit = 50;
    const r = await api.post<{ id: number }>('/recipes', {
      productId: products[0].id,
      recipeYield: 1,
      items: [{ materialId: m.id, quantity: gramsPerUnit, unit: 'G' }],
    });
    recipe = { id: r.id, gramsPerUnit };
  }

  const employees: World['employees'] = [];
  if (opts.employees) {
    const roles = await api.get<Array<{ id: number; name: string }>>('/job-roles');
    const jobRoleId = roles.find((r) => r.name === 'E2E Baker')!.id;
    for (let i = 0; i < opts.employees; i++) {
      const dailyRate = opts.dailyRate ?? 600;
      const restDays = opts.restDays ?? [0];
      const e = await api.post<{ id: number; firstName: string; lastName: string }>('/employees', {
        firstName: `E2E${id}`,
        lastName: `Worker${i + 1}`,
        jobRoleId,
        branchId: branch.id,
        restDays,
        hiredOn: opts.hireDate ?? today(),
        dailyRate,
      });
      if (opts.recurringDeduction) {
        await api.post(`/employees/${e.id}/recurring-deductions`, {
          name: 'SSS',
          employeeShare: opts.recurringDeduction,
        });
      }
      employees.push({ id: e.id, firstName: e.firstName, lastName: e.lastName, dailyRate, restDays });
    }
  }

  return { id, branch, manager: { id: manager.id, email, password: PASSWORD }, products, material, recipe, employees };
}

/** A browser page signed in as the world's manager, via the API cookie flow (no UI). */
export async function managerPage(browser: Browser, world: World): Promise<Page> {
  const context = await browser.newContext();
  const res = await context.request.post('/api/v1/auth/login', {
    data: { email: world.manager.email, password: world.manager.password },
  });
  if (!res.ok()) throw new Error(`manager login → ${res.status()}`);
  // The response set refresh_token (HttpOnly) + has_session on this context;
  // AuthContext re-mints the access token on first page load.
  return context.newPage();
}
