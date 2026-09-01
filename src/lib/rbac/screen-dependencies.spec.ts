import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURE_LIST, ROLES, ROLE_DEFAULTS, featureForPath } from './features';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const APP_DIR = join(REPO_ROOT, 'src', 'app', '(app)');

/**
 * The feature key each API service is gated behind, mirroring the
 * `@RequireFeature()` decorators on the controllers.
 *
 * `null` means deliberately ungated: catalog reads feed pickers on nearly every
 * screen, so requiring their key would break screens the user is entitled to.
 * An array means any one of the keys suffices.
 */
const API_FEATURE: Record<string, string | string[] | null> = {
  authApi: null,
  usersApi: null, // only `me/permissions` is called outside the admin screen
  notificationsApi: null,
  branchesApi: null,
  productsApi: null,
  materialsApi: null,
  suppliersApi: null, // picker in the material stock-card dialog

  dashboardApi: 'dashboard',
  salesApi: 'analytics',
  inventoryApi: ['inventory-history', 'dashboard'],
  inventoryAdjustmentsApi: 'inventory-adjustments',
  inventoryImportApi: 'inventory-import',
  importLogsApi: 'inventory-import',
  productionApi: ['production', 'production-cost', 'production-efficiency'],
  productionOrdersApi: ['production-orders', 'dashboard'],
  materialInventoryApi: 'material-stock',
  materialAdjustmentsApi: 'material-stock',
  recipesApi: 'recipes',
  unitConversionsApi: 'unit-conversions',
  permissionsApi: 'permissions',
  jobsApi: 'jobs',
};

/**
 * Calls that are deliberately gated more tightly than the screen containing
 * them, and are hidden from users who cannot make them.
 *
 * Each entry must correspond to a real conditional in the page — otherwise the
 * user sees a control that fails with a 403 when they use it.
 */
const GUARDED_IN_UI: Record<string, string[]> = {
  // Autofill belongs to `jobs`; hidden behind useHasFeature('jobs').
  'inventory/gaps': ['jobsApi'],
  // Reachable only with `material-stock`, which no role holds without `jobs`.
  'material-inventory/gaps': ['jobsApi'],
  // Reachable only with `production`, likewise.
  production: ['jobsApi'],
  // The users screen reads the role matrix to preview access at creation time.
  'settings/users': ['permissionsApi'],
};

/** Every directory under (app) that contains a page.tsx, as a URL path. */
function screenDirs(dir = APP_DIR, prefix = ''): { route: string; dir: string }[] {
  const found: { route: string; dir: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith('(') || entry.startsWith('_')) {
      found.push(...screenDirs(full, prefix));
      continue;
    }
    const route = `${prefix}/${entry}`;
    if (readdirSync(full).includes('page.tsx')) found.push({ route, dir: full });
    found.push(...screenDirs(full, route));
  }
  return found;
}

/** API service objects referenced anywhere beneath a screen directory. */
function apisUsedIn(dir: string, stopAt: Set<string>, prefix = ''): string[] {
  const found = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Do not attribute a nested screen's calls to its parent.
      const nested = `${prefix}/${entry}`;
      if (stopAt.has(nested)) continue;
      for (const api of apisUsedIn(full, stopAt, nested)) found.add(api);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    const src = readFileSync(full, 'utf-8');
    for (const m of src.matchAll(/\b([a-z][a-zA-Z]*Api)\b/g)) found.add(m[1]);
  }
  return [...found];
}

const screens = screenDirs();

describe('screen data dependencies', () => {
  it('recognises every API service the app defines', () => {
    // An unmapped service silently skips this whole check, so the map has to be
    // kept complete for the suite below to mean anything.
    const declared = readFileSync(join(REPO_ROOT, 'src', 'lib', 'apiServices.ts'), 'utf-8');
    const exported = [...declared.matchAll(/^export const ([a-zA-Z]+Api)\b/gm)].map((m) => m[1]);
    expect(Object.keys(API_FEATURE).sort()).toEqual(exported.sort());
  });

  /**
   * The invariant the dashboard broke: a role permitted to open a screen must be
   * able to reach the data that screen loads.
   *
   * The dashboard aggregates inventory and production-order data, so gating
   * those controllers at their own screen key alone made it 403 for VIEWER —
   * which holds `dashboard` but neither of the others. That only showed up when
   * the page was loaded in a browser. This asserts it statically instead.
   */
  describe.each(screens.map((s) => [s.route, s.dir] as const))('%s', (route, dir) => {
    const feature = featureForPath(route);
    const routeSet = new Set(screens.map((s) => s.route));
    const guarded = new Set(GUARDED_IN_UI[route.replace(/^\//, '')] ?? []);
    const apis = apisUsedIn(dir, routeSet, route).filter((a) => !guarded.has(a));

    const entitledRoles = ROLES.filter(
      (role) => feature === null || (ROLE_DEFAULTS[role] as readonly string[]).includes(feature.key),
    );

    if (entitledRoles.length === 0) {
      it('is off by default for every role', () => {
        expect(feature).not.toBeNull();
      });
      return;
    }

    it.each(entitledRoles)('%s can reach everything this screen loads', (role) => {
      const held = ROLE_DEFAULTS[role] as readonly string[];
      const unreachable = apis.filter((api) => {
        const required = API_FEATURE[api];
        if (required === null || required === undefined) return false;
        const keys = Array.isArray(required) ? required : [required];
        return !keys.some((k) => held.includes(k));
      });
      expect(unreachable).toEqual([]);
    });
  });

  it('references only real API services in the UI-guarded exceptions', () => {
    for (const apis of Object.values(GUARDED_IN_UI)) {
      for (const api of apis) expect(API_FEATURE[api]).toBeDefined();
    }
  });

  it('scopes every UI-guarded exception to a real screen', () => {
    const routes = new Set(screens.map((s) => s.route.replace(/^\//, '')));
    for (const key of Object.keys(GUARDED_IN_UI)) expect(routes.has(key)).toBe(true);
  });

  it('maps every gated API to a feature the manifest defines', () => {
    const known = new Set(FEATURE_LIST.map((f) => f.key));
    for (const required of Object.values(API_FEATURE)) {
      if (required === null) continue;
      for (const key of Array.isArray(required) ? required : [required]) {
        expect(known.has(key)).toBe(true);
      }
    }
  });
});
