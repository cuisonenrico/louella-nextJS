import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_LOCKED_KEYS,
  FEATURE_LIST,
  MOBILE_CONTRACT_KEYS,
  PERMISSION_KEYS,
  PERMISSION_LIST,
  ROLES,
  ROLE_DEFAULTS,
  canAccessPath,
  featureForPath,
  firstPermittedRoute,
  navigationFor,
  prefixMatches,
} from './features';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const APP_DIR = join(REPO_ROOT, 'src', 'app', '(app)');

/** Every route the (app) group actually serves, as URL paths. */
function discoverRoutes(dir = APP_DIR, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    // Route groups like (app) contribute no URL segment; private folders
    // (components/, lib/, hooks/) are not routes at all.
    if (entry.startsWith('(') || entry.startsWith('_')) {
      found.push(...discoverRoutes(full, prefix));
      continue;
    }
    const path = `${prefix}/${entry}`;
    if (readdirSync(full).includes('page.tsx')) found.push(path);
    found.push(...discoverRoutes(full, path));
  }
  return found;
}

/**
 * Routes deliberately left ungated.
 *
 * `/no-access` is where a user with no permitted screens is sent; gating the
 * page that explains a lack of access would recreate the redirect loop it
 * exists to end.
 */
const UNGATED_ROUTES = new Set(['/no-access']);

describe('RBAC manifest', () => {
  describe('structural integrity', () => {
    it('has unique keys', () => {
      const keys = FEATURE_LIST.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('has unique route prefixes across features', () => {
      const seen = new Map<string, string>();
      for (const f of FEATURE_LIST) {
        for (const route of f.routes) {
          expect(seen.has(route)).toBe(false);
          seen.set(route, f.key);
        }
      }
    });

    it('gives every nav destination a route that its own feature governs', () => {
      for (const f of FEATURE_LIST) {
        if (!f.nav) continue;
        expect(featureForPath(f.nav.href)?.key).toBe(f.key);
      }
    });

    it('gives mobile-only features no web route', () => {
      for (const f of FEATURE_LIST) {
        if (f.platform === 'mobile') expect(f.routes).toHaveLength(0);
      }
    });

    it('assigns a nav entry to every feature that has a web route', () => {
      for (const f of FEATURE_LIST) {
        if (f.routes.length > 0) expect(f.nav).toBeDefined();
      }
    });

    it('orders nav entries uniquely so the sidebar is deterministic', () => {
      const orders = FEATURE_LIST.filter((f) => f.nav).map((f) => f.nav!.order);
      expect(new Set(orders).size).toBe(orders.length);
    });
  });

  describe('route coverage', () => {
    // The test that keeps this system honest: a page added without a feature
    // fails the build rather than silently shipping ungated.
    it('covers every page in the (app) route group', () => {
      const uncovered = discoverRoutes()
        .filter((route) => !UNGATED_ROUTES.has(route))
        .filter((route) => featureForPath(route) === null);

      expect(uncovered).toEqual([]);
    });

    it('resolves nested routes to the longest matching prefix', () => {
      // The bug this replaced: /settings matched before /settings/jobs, so
      // managers who could see the Jobs link were bounced when they clicked it.
      expect(featureForPath('/settings/jobs')?.key).toBe('jobs');
      expect(featureForPath('/settings/users')?.key).toBe('user-management');
      expect(featureForPath('/settings/permissions')?.key).toBe('permissions');
      // /production must not swallow /production/orders.
      expect(featureForPath('/production')?.key).toBe('production');
      expect(featureForPath('/production/orders')?.key).toBe('production-orders');
      expect(featureForPath('/production-orders')?.key).toBe('production-orders');
    });

    it('does not let a prefix leak into a similarly named sibling', () => {
      expect(featureForPath('/inventory/gaps')?.key).toBe('inventory-history');
      expect(featureForPath('/inventory-adjustments')?.key).toBe('inventory-adjustments');
      expect(featureForPath('/inventory-import/history')?.key).toBe('inventory-import');
      expect(featureForPath('/production-cost')?.key).toBe('production-cost');
    });

    it('matches a prefix only on a segment boundary', () => {
      expect(prefixMatches('/inventory', '/inventory')).toBe(true);
      expect(prefixMatches('/inventory/details', '/inventory')).toBe(true);
      expect(prefixMatches('/inventory-import', '/inventory')).toBe(false);
    });
  });

  describe('mobile contract', () => {
    // louella_mobile mirrors these keys and the shipped build is frozen against
    // the old Cloud Run image. Renaming one breaks the app in the field.
    it.each(MOBILE_CONTRACT_KEYS)('still defines %s', (key) => {
      expect(FEATURE_LIST.some((f) => f.key === key)).toBe(true);
    });

    // `louella_mobile` is a sibling checkout, not part of this repo, so it is
    // not always present. Skipping beats a red suite that says nothing about
    // this codebase — the per-key assertions above still hold the contract.
    const DART_KEYS = join(
      REPO_ROOT, '..', 'louella_mobile', 'lib', 'core', 'constants', 'feature_keys.dart',
    );
    const itIfPresent = existsSync(DART_KEYS) ? it : it.skip;
    itIfPresent('matches feature_keys.dart exactly', () => {
      const dart = readFileSync(DART_KEYS, 'utf-8');
      const declared = [...dart.matchAll(/=\s*'([a-z-]+)'/g)].map((m) => m[1]);
      expect(declared.sort()).toEqual([...MOBILE_CONTRACT_KEYS].sort());
    });
  });

  describe('role defaults', () => {
    it('defines defaults for every role', () => {
      for (const role of ROLES) expect(ROLE_DEFAULTS[role]).toBeDefined();
    });

    it('references only keys that exist', () => {
      // Defaults now name actions and panels as well as screens.
      const keys = new Set(PERMISSION_KEYS);
      for (const role of ROLES) {
        for (const key of ROLE_DEFAULTS[role]) expect(keys.has(key)).toBe(true);
      }
    });

    it('lists no key twice within a role', () => {
      for (const role of ROLES) {
        const keys = ROLE_DEFAULTS[role];
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it('grants ADMIN every key it must never lose', () => {
      for (const key of ADMIN_LOCKED_KEYS) {
        expect(ROLE_DEFAULTS.ADMIN).toContain(key);
      }
    });

    it('gives every role except USER somewhere to land', () => {
      // A role whose landing route resolves to /no-access is soft-bricked: the
      // login redirect and the denial redirect would both send it nowhere. This
      // is exactly what happened to INVENTORY, which lacked `dashboard`.
      for (const role of ROLES) {
        if (role === 'USER') continue;
        expect(firstPermittedRoute(ROLE_DEFAULTS[role])).not.toBe('/no-access');
      }
    });

    it('sends an unprovisioned USER to /no-access rather than into a loop', () => {
      expect(firstPermittedRoute(ROLE_DEFAULTS.USER)).toBe('/no-access');
    });

    it('keeps the two orphan report pages off by default', () => {
      for (const role of ROLES) {
        expect(ROLE_DEFAULTS[role]).not.toContain('production-cost');
        expect(ROLE_DEFAULTS[role]).not.toContain('production-efficiency');
      }
    });
  });

  describe('access resolution', () => {
    it('permits a route only when the governing key is held', () => {
      expect(canAccessPath('/products', ['products'])).toBe(true);
      expect(canAccessPath('/products', ['recipes'])).toBe(false);
      expect(canAccessPath('/products/123', ['products'])).toBe(true);
    });

    it('leaves ungated routes open', () => {
      expect(canAccessPath('/no-access', [])).toBe(true);
    });

    it('never returns a destination the permissions do not cover', () => {
      for (const role of ROLES) {
        const target = firstPermittedRoute(ROLE_DEFAULTS[role]);
        if (target === '/no-access') continue;
        expect(canAccessPath(target, ROLE_DEFAULTS[role])).toBe(true);
      }
    });

    it('lists only permitted destinations in the navigation', () => {
      const nav = navigationFor(['dashboard', 'products']);
      const keys = nav.flatMap((g) => g.items.map((i) => i.key));
      expect(keys.sort()).toEqual(['dashboard', 'products']);
    });

    it('returns nothing to navigate to when no permissions are held', () => {
      expect(navigationFor([])).toEqual([]);
    });
  });

  describe('database registration', () => {
    // Both override tables have a foreign key onto Feature.key, so a key missing
    // from the registry cannot be toggled at all — it fails with a constraint
    // violation instead of saving.
    // Screens were registered by the first migration, actions and panels by the
    // second. Both are read so the check covers every grantable key regardless
    // of which migration introduced it.
    const migration = ['20260819000000_seed_rbac_feature_registry', '20260902000000_rbac_action_and_panel_keys']
      .map((dir) =>
        readFileSync(join(REPO_ROOT, 'prisma', 'migrations', dir, 'migration.sql'), 'utf-8'),
      )
      .join('\n');

    it.each(PERMISSION_KEYS)('registers %s in a migration', (key) => {
      expect(migration).toContain(`('${key}',`);
    });

    it('registers nothing the manifest does not define', () => {
      const seeded = [...migration.matchAll(/^\s*\('([a-z:-]+)',/gm)].map((m) => m[1]);
      const known = new Set<string>(PERMISSION_KEYS);
      expect([...new Set(seeded)].filter((k) => !known.has(k))).toEqual([]);
    });

    it('agrees with the standalone seed script', () => {
      const seed = readFileSync(join(REPO_ROOT, 'prisma', 'seed-features.sql'), 'utf-8');
      for (const p of PERMISSION_LIST) expect(seed).toContain(`('${p.key}',`);
    });
  });
});
