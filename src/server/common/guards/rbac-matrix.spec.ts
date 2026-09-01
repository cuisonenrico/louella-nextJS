import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import {
  PERMISSION_BY_KEY,
  PERMISSION_LIST,
  ROLE_DEFAULTS,
  type RoleName,
} from '@/lib/rbac/features';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { FeatureGuard } from './feature.guard';
import { RolesGuard } from './roles.guard';

// Controllers under test. Importing the real classes means the table is checked
// against the decorators actually shipped, not a restatement of them.
import { BranchesController } from '../../branches/branches.controller';
import { DashboardController } from '../../dashboard/dashboard.controller';
import { InventoryController } from '../../inventory/inventory.controller';
import { InventoryAdjustmentsController } from '../../inventory-adjustments/inventory-adjustments.controller';
import { InventoryImportController } from '../../inventory-import/inventory-import.controller';
import { JobsController } from '../../jobs/jobs.controller';
import { MaterialAdjustmentsController } from '../../material-adjustments/material-adjustments.controller';
import { MaterialInventoryController } from '../../material-inventory/material-inventory.controller';
import { MaterialsController } from '../../materials/materials.controller';
import { PermissionsController } from '../../permissions/permissions.controller';
import { ProductionController } from '../../production/production.controller';
import { ProductionOrdersController } from '../../production-orders/production-orders.controller';
import { ProductsController } from '../../products/products.controller';
import { RecipesController } from '../../recipes/recipes.controller';
import { SalesController } from '../../sales/sales.controller';
import { SuppliersController } from '../../suppliers/suppliers.controller';
import { UnitConversionsController } from '../../unit-conversions/unit-conversions.controller';
import { UsersController } from '../../users/users.controller';

const reflector = new Reflector();
const rolesGuard = new RolesGuard(reflector);
const featureGuard = new FeatureGuard(reflector);

type Target = { controller: new (...args: never[]) => object; method: string };

/**
 * Runs the real guard chain for one role against one handler.
 *
 * RolesGuard runs first globally, then FeatureGuard, so this mirrors the order
 * a request actually takes.
 */
function evaluate(role: RoleName, { controller, method }: Target): 'allow' | 'deny' {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${method} does not exist`);
  }

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: 1, role, permissions: [...ROLE_DEFAULTS[role]] },
      }),
    }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;

  try {
    rolesGuard.canActivate(context);
    featureGuard.canActivate(context);
    return 'allow';
  } catch (err) {
    if (err instanceof ForbiddenException) return 'deny';
    throw err;
  }
}

const A = 'allow';
const D = 'deny';

/**
 * The authorization matrix, asserted end to end.
 *
 * Each row is [label, target, expected-per-role]. Roles are in hierarchy order:
 * VIEWER, INVENTORY, MANAGER, ADMIN. USER is covered separately — it holds no
 * permissions at all and must be denied everything.
 */
const MATRIX: [string, Target, [string, string, string, string]][] = [
  // ── Reads gated by a screen's own feature ────────────────────────────────
  ['dashboard summary',    { controller: DashboardController, method: 'getSummary' },   [A, A, A, A]],
  ['sales by branch',      { controller: SalesController, method: 'getByBranchAndDate' }, [A, D, D, A]],
  ['inventory list',       { controller: InventoryController, method: 'findAll' },      [D, A, A, A]],
  ['adjustments list',     { controller: InventoryAdjustmentsController, method: 'findByInventory' }, [D, A, A, A]],
  ['production list',      { controller: ProductionController, method: 'findAll' },     [D, D, A, A]],
  ['production orders',    { controller: ProductionOrdersController, method: 'findAll' }, [D, D, A, A]],
  ['material stock list',  { controller: MaterialInventoryController, method: 'findAll' }, [D, D, A, A]],
  ['recipes list',         { controller: RecipesController, method: 'findAll' },        [D, D, D, A]],
  ['import logs',          { controller: InventoryImportController, method: 'getLogs' }, [D, D, D, A]],
  ['job runs',             { controller: JobsController, method: 'getRuns' },           [D, D, D, A]],

  // ── Endpoints the dashboard aggregates ──────────────────────────────────
  // The dashboard screen reads from the inventory and production-order domains.
  // Gating those controllers at their own screen key alone made the dashboard
  // 403 for VIEWER, which holds `dashboard` but neither of the others — caught
  // by the browser walk, not by any unit test, hence these rows.
  ['inventory dashboard',  { controller: InventoryController, method: 'getDashboard' },  [A, A, A, A]],
  ['inventory by date',    { controller: InventoryController, method: 'findByDateAllBranches' }, [A, A, A, A]],
  ['rejection by product', { controller: InventoryController, method: 'getRejectionByProduct' }, [A, A, A, A]],
  ['orders by date',       { controller: ProductionOrdersController, method: 'findByDate' }, [A, A, A, A]],

  // ── The two off-by-default report screens ───────────────────────────────
  // Their pages are governed by their own keys but their data comes from the
  // production controller. Accepting the screen key means switching the page on
  // is one grant, not two. No default role holds either key, so both columns are
  // `allow` purely via `production`.
  ['production cost data',       { controller: ProductionController, method: 'getConsumptionSummary' }, [D, D, A, A]],
  ['production efficiency data', { controller: ProductionController, method: 'getEfficiency' },                 [D, D, A, A]],

  // ── Catalog reads stay open; they feed pickers on every screen ───────────
  ['branch list (open)',   { controller: BranchesController, method: 'findAll' },       [A, A, A, A]],
  ['product list (open)',  { controller: ProductsController, method: 'findAll' },       [A, A, A, A]],
  ['material list (open)', { controller: MaterialsController, method: 'findAll' },      [A, A, A, A]],
  // Suppliers joined the open catalog reads: the supplier picker in the
  // material stock-card dialog needs it, so gating the list broke that screen
  // for anyone holding `material-stock` without `suppliers`.
  ['supplier list (open)', { controller: SuppliersController, method: 'findAll' },      [A, A, A, A]],
  // low-stock also accepts the mobile key, so the mobile screen can be granted
  // to a role without handing over the whole materials catalog. No default role
  // exercises that today — MANAGER and ADMIN hold both keys — but the ANY
  // semantics are what make the grant possible at all.
  ['materials low-stock',  { controller: MaterialsController, method: 'findLowStock' }, [D, D, A, A]],

  // ── Catalog writes require the key AND the role ──────────────────────────
  // MANAGER is denied throughout: the catalog is no longer a branch manager's
  // default. Each of these is a grant an admin makes deliberately.
  ['create branch',        { controller: BranchesController, method: 'create' },        [D, D, D, A]],
  ['create product',       { controller: ProductsController, method: 'create' },        [D, D, D, A]],
  ['delete product',       { controller: ProductsController, method: 'remove' },        [D, D, D, A]],
  ['create material',      { controller: MaterialsController, method: 'create' },       [D, D, D, A]],
  ['create unit conv.',    { controller: UnitConversionsController, method: 'create' }, [D, D, D, A]],

  // ── Domain writes ────────────────────────────────────────────────────────
  ['create inventory',     { controller: InventoryController, method: 'create' },       [D, A, A, A]],
  ['create adjustment',    { controller: InventoryAdjustmentsController, method: 'create' }, [D, A, A, A]],
  ['create production',    { controller: ProductionController, method: 'create' },      [D, D, A, A]],
  ['run import',           { controller: InventoryImportController, method: 'import' }, [D, D, D, A]],
  ['delete import log',    { controller: InventoryImportController, method: 'deleteLog' }, [D, D, D, A]],

  // ── The action tier: same screen, different verb ─────────────────────────
  // A MANAGER holds `production` and `production:edit` but not
  // `production:delete`, so the same controller answers differently per verb.
  // This is the whole point of the child keys — before them, granting the
  // Production screen granted deleting from it too.
  ['edit production',      { controller: ProductionController, method: 'update' },      [D, D, A, A]],
  ['delete production',    { controller: ProductionController, method: 'remove' },      [D, D, D, A]],
  ['edit inventory',       { controller: InventoryController, method: 'update' },       [D, A, A, A]],
  ['delete inventory',     { controller: InventoryController, method: 'remove' },       [D, A, D, A]],
  ['transfer adjustment',  { controller: InventoryAdjustmentsController, method: 'transfer' }, [D, A, A, A]],
  ['delete adjustment',    { controller: InventoryAdjustmentsController, method: 'remove' },   [D, A, D, A]],

  // ── Admin surfaces ───────────────────────────────────────────────────────
  ['list users',           { controller: UsersController, method: 'findAll' },          [D, D, D, A]],
  ['create user',          { controller: UsersController, method: 'create' },           [D, D, D, A]],
  ['reset password',       { controller: UsersController, method: 'resetPassword' },    [D, D, D, A]],
  ['permission matrix',    { controller: PermissionsController, method: 'getMatrix' },  [D, D, D, A]],
  ['set role permission',  { controller: PermissionsController, method: 'setRolePermission' }, [D, D, D, A]],

  // ── Always open to any authenticated user ────────────────────────────────
  ['own permissions',      { controller: UsersController, method: 'myPermissions' },    [A, A, A, A]],
];

const ROLE_COLUMNS: RoleName[] = ['VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'];

describe('RBAC role x endpoint matrix', () => {
  describe.each(MATRIX)('%s', (_label, target, expected) => {
    it.each(ROLE_COLUMNS.map((role, i) => [role, expected[i]] as const))(
      '%s -> %s',
      (role, outcome) => {
        expect(evaluate(role, target)).toBe(outcome);
      },
    );
  });

  describe('unprovisioned USER', () => {
    // The default role on a fresh account holds no feature permissions, so every
    // gated endpoint must refuse it.
    //
    // The exceptions are the endpoints that carry no gate at all: catalog reads,
    // which are open to any authenticated user by long-standing design (see
    // AGENTS.md), and the endpoint the client calls to discover it may render
    // nothing. This role is a provisioning placeholder, not a security boundary
    // on its own — an account left on USER can still read reference data.
    const openToUser = new Set([
      'own permissions',
      'branch list (open)',
      'product list (open)',
      'material list (open)',
      'supplier list (open)',
    ]);

    it.each(MATRIX)('%s', (label, target) => {
      const expected = openToUser.has(label) ? 'allow' : 'deny';
      expect(evaluate('USER', target)).toBe(expected);
    });
  });

  describe('guard wiring', () => {
    it('annotates every gated controller with a key the manifest defines', () => {
      // A typo in @RequireFeature would otherwise produce an endpoint nobody can
      // ever reach, silently.
      const controllers = [...new Set(MATRIX.map(([, t]) => t.controller))];
      for (const controller of controllers) {
        const keys = reflector.get<string[]>(FEATURE_KEY, controller) ?? [];
        for (const key of keys) {
          expect(ROLE_DEFAULTS.ADMIN as readonly string[]).toContain(key);
        }
      }
    });

    it('keeps @Roles on admin surfaces as well as the feature key', () => {
      // Defence in depth: the feature key says who may reach the screen, the
      // role says who may act. Losing either silently widens access.
      expect(reflector.get(ROLES_KEY, UsersController.prototype.create)).toEqual([
        UserRole.ADMIN,
      ]);
      expect(reflector.get(FEATURE_KEY, UsersController.prototype.create)).toEqual([
        'user-management:create',
      ]);
    });

    it('leaves the client-facing permissions endpoint ungated', () => {
      expect(reflector.get(FEATURE_KEY, UsersController.prototype.myPermissions)).toBeUndefined();
      expect(reflector.get(ROLES_KEY, UsersController.prototype.myPermissions)).toBeUndefined();
    });
  });
});


/**
 * `ActionDef.minRole` duplicates the `@Roles()` floor already written on the
 * controllers, which is exactly the drift the manifest exists to prevent. It is
 * kept because the admin matrix needs the ceiling as data at runtime — but it is
 * checked here against the real decorator metadata rather than trusted, so the
 * two cannot ship disagreeing.
 */
describe('action minRole mirrors the decorators', () => {
  const CONTROLLERS = [
    BranchesController, DashboardController, InventoryController,
    InventoryAdjustmentsController, InventoryImportController, JobsController,
    MaterialAdjustmentsController, MaterialInventoryController, MaterialsController,
    PermissionsController, ProductionController, ProductionOrdersController,
    ProductsController, RecipesController, SalesController, SuppliersController,
    UnitConversionsController, UsersController,
  ];

  /** Every [actionKey, declaredRoleFloor] pair actually wired to a handler. */
  const wired: { key: string; method: string; roles: string[] }[] = [];

  for (const controller of CONTROLLERS) {
    const proto = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || typeof proto[name] !== 'function') continue;
      const handler = proto[name] as (...args: never[]) => unknown;
      const keys =
        reflector.getAllAndOverride<string[]>(FEATURE_KEY, [handler, controller]) ?? [];
      const roles =
        reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, controller]) ?? [];
      for (const key of keys) {
        if (PERMISSION_BY_KEY.get(key)?.kind !== 'action') continue;
        wired.push({ key, method: `${controller.name}.${name}`, roles });
      }
    }
  }

  it('finds the action keys on real handlers', () => {
    // Guards the rest of this block: an empty sweep would pass vacuously.
    expect(wired.length).toBeGreaterThan(30);
  });

  it.each(wired.map((w) => [w.method, w.key] as const))(
    '%s enforces the floor declared for %s',
    (method, key) => {
      const entry = wired.find((w) => w.method === method && w.key === key)!;
      const declared = PERMISSION_BY_KEY.get(key)!.minRole;
      // A handler with no @Roles imposes no floor, so nothing to reconcile.
      if (entry.roles.length === 0) return;
      expect(entry.roles).toContain(declared);
    },
  );

  it('wires up every action the manifest declares', () => {
    // An action nobody enforces is a switch in the admin screen that does
    // nothing — worse than no switch, because it reads as a control.
    const wiredKeys = new Set(wired.map((w) => w.key));
    const declared = PERMISSION_LIST.filter((p) => p.kind === 'action').map((p) => p.key);
    expect(declared.filter((k) => !wiredKeys.has(k))).toEqual([]);
  });
});
