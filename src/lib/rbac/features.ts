/**
 * The single source of truth for feature-based access control.
 *
 * Everything that expresses "who may see or reach what" derives from this file:
 * the sidebar, the client route guard, the server's role defaults, the
 * `Feature` table seed, and the `@RequireFeature()` decorators on controllers.
 * Two copies of these rules previously lived in `Sidebar.tsx` and
 * `RouteGuard.tsx` and had already drifted apart; deriving both from here makes
 * that class of bug structurally impossible rather than merely tested for.
 *
 * IMPORTANT - this module must stay free of imports. It is loaded by the Nest
 * server as well as the browser bundle, so it cannot pull in React, lucide
 * icons, or `@prisma/client`. Nav icons live in
 * `src/components/layout/navIcons.ts`, keyed by feature key.
 *
 * IMPORTANT - the ten keys listed in MOBILE_CONTRACT_KEYS are mirrored in
 * `louella_mobile/lib/core/constants/feature_keys.dart`, and the Flutter build
 * currently in the field is frozen against the old Cloud Run image. Adding keys
 * is safe (mobile ignores what it does not know); renaming or removing one of
 * those ten breaks the mobile app.
 *
 * ## Three tiers
 *
 * A feature is a screen. Under it sit two kinds of child permission:
 *
 *   - **actions** - a write verb the screen offers (`products:delete`).
 *   - **panels**  - a region of a screen (`dashboard:revenue-trend`).
 *
 * Children flatten to `<feature>:<child-id>` and are stored, transmitted and
 * enforced as ordinary opaque keys, exactly like a feature key. Nothing
 * downstream - `resolvePermissions`, `FeatureGuard`, either override table, or
 * the `permissions: string[]` wire format - had to learn a new shape.
 *
 * A child is only ever effective while its parent feature is effective. That
 * rule is enforced once, in `enforceParentRule`, and applied by the server when
 * it resolves a user's permissions.
 */

/** Role names, duplicated from the Prisma `UserRole` enum. */
export const ROLES = ['USER', 'VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'] as const;
export type RoleName = (typeof ROLES)[number];

/** Ascending privilege order, mirroring `RolesGuard`'s hierarchy. */
export const ROLE_RANK: Record<RoleName, number> = {
  USER: 0,
  VIEWER: 1,
  INVENTORY: 2,
  MANAGER: 3,
  ADMIN: 4,
};

export type NavGroup =
  | 'Overview'
  | 'Operations'
  | 'Stock'
  | 'Catalog'
  | 'Config'
  | 'Settings';

/**
 * A write verb a screen offers, grantable independently of the screen itself.
 *
 * `minRole` mirrors the `@Roles()` floor on the endpoints this action covers.
 * It is NOT hand-trusted: `rbac-matrix.spec` reads the real decorator metadata
 * off the controller classes and asserts this matches, so a drift fails a test
 * rather than silently offering an admin a grant that 403s.
 */
export type ActionDef = {
  /** Unique within the feature. Flattens to `<feature>:<id>`. */
  id: string;
  label: string;
  description: string;
  minRole: RoleName;
};

/**
 * A region of a screen, grantable independently.
 *
 * `sensitivity` says how far the gate goes:
 *
 *   - `presentation` - hidden client-side only. The data still reaches the
 *     browser, so this is a tidiness control, NOT a security boundary.
 *   - `sensitive`    - additionally withheld by the server: either the panel
 *     has its own endpoint carrying this key on `@RequireFeature`, or the
 *     owning service strips the fields before they are serialised.
 *
 * There is deliberately no field-name list here. This module is import-free, so
 * field names would be bare strings that silently stop matching when a DTO is
 * renamed - a security control whose failure mode is silence. Stripping lives
 * in typed server code where a rename is a compile error.
 */
export type PanelDef = {
  id: string;
  label: string;
  description: string;
  sensitivity: 'presentation' | 'sensitive';
};

export type FeatureDef = {
  /** Stable identifier. Persisted in `Feature.key` and referenced by overrides. */
  key: string;
  label: string;
  description: string;
  /**
   * Route prefixes this feature governs. A prefix matches a pathname that
   * equals it or begins with it followed by `/`. Empty for mobile-only
   * features and for features that gate no screen of their own.
   */
  routes: readonly string[];
  /** Sidebar placement. Omitted for features that are not nav destinations. */
  nav?: { group: NavGroup; href: string; label: string; order: number };
  /** Which client consumes this feature. Drives seed docs and conformance tests. */
  platform: 'web' | 'mobile' | 'both';
  actions?: readonly ActionDef[];
  panels?: readonly PanelDef[];
};

export const FEATURES = [
  // -- Overview -------------------------------------------------------------
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Revenue and KPI summary cards',
    routes: ['/dashboard'],
    nav: { group: 'Overview', href: '/dashboard', label: 'Dashboard', order: 10 },
    platform: 'both',
    panels: [
      {
        id: 'kpis',
        label: 'KPI row',
        description: 'Product, branch, material and recipe counts',
        sensitivity: 'sensitive',
      },
      {
        id: 'revenue-trend',
        label: 'Revenue trend',
        description: 'Daily revenue, sold, delivery and leftover trend',
        sensitivity: 'sensitive',
      },
      {
        id: 'production-mix',
        label: 'Production mix',
        description: "Today's yield broken down by product type",
        sensitivity: 'sensitive',
      },
      {
        id: 'branch-orders',
        label: 'Branch orders',
        description: 'Draft and finalised production order counts for today',
        sensitivity: 'sensitive',
      },
      {
        id: 'branch-gaps',
        label: 'Branches missing inventory',
        description:
          'Which active branches have not entered inventory today. Names other branches, so it is cross-branch information.',
        sensitivity: 'sensitive',
      },
      {
        id: 'low-stock',
        label: 'Low stock card',
        description: 'Materials at or below reorder level',
        sensitivity: 'sensitive',
      },
      {
        id: 'rejections',
        label: 'Rejections by product',
        description: 'Reject counts per product for the period',
        sensitivity: 'sensitive',
      },
    ],
  },

  // -- Operations -----------------------------------------------------------
  {
    key: 'analytics',
    label: 'Revenue & Analytics',
    description: 'Sales charts, revenue trends and product performance',
    routes: ['/sales'],
    nav: { group: 'Operations', href: '/sales', label: 'Revenue', order: 20 },
    platform: 'both',
  },
  {
    key: 'inventory-history',
    label: 'Inventory',
    description: 'Daily inventory history, gaps and rejections',
    routes: ['/inventory'],
    nav: { group: 'Operations', href: '/inventory/details', label: 'Inventory', order: 21 },
    platform: 'both',
    actions: [
      {
        id: 'create',
        label: 'Create entries',
        description: 'Add inventory rows, singly or in bulk',
        minRole: 'INVENTORY',
      },
      {
        id: 'edit',
        label: 'Edit entries',
        description: 'Amend an existing inventory row',
        minRole: 'INVENTORY',
      },
      {
        id: 'delete',
        label: 'Delete entries',
        description: 'Remove an inventory row',
        minRole: 'INVENTORY',
      },
      {
        id: 'recascade',
        label: 'Recascade',
        description: 'Recompute carried-forward stock across subsequent days',
        minRole: 'INVENTORY',
      },
    ],
    panels: [
      {
        id: 'gaps',
        label: 'Gap analysis',
        description: 'Days with missing inventory entries',
        sensitivity: 'sensitive',
      },
      {
        id: 'export-sales',
        label: 'Sales export',
        description: 'Download the sales spreadsheet for a period',
        sensitivity: 'sensitive',
      },
    ],
  },
  {
    key: 'inventory-adjustments',
    label: 'Inventory Adjustments',
    description: 'Pull-ins, pull-outs, transfers and anomaly corrections',
    routes: ['/inventory-adjustments'],
    nav: { group: 'Operations', href: '/inventory-adjustments', label: 'Adjustments', order: 22 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create adjustment',
        description: 'Record a pull-in or pull-out',
        minRole: 'INVENTORY',
      },
      {
        id: 'transfer',
        label: 'Transfer between branches',
        description: 'Move stock from one branch to another',
        minRole: 'INVENTORY',
      },
      {
        id: 'edit',
        label: 'Edit adjustment',
        description: 'Amend an existing adjustment',
        minRole: 'INVENTORY',
      },
      {
        id: 'delete',
        label: 'Delete adjustment',
        description: 'Remove an adjustment and reverse its effect',
        minRole: 'INVENTORY',
      },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    description: 'Daily production board',
    routes: ['/production'],
    nav: { group: 'Operations', href: '/production', label: 'Production', order: 23 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Record production',
        description: 'Add production rows, singly or in bulk',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit production',
        description: 'Amend a production row',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete production',
        description: 'Remove a production row',
        minRole: 'MANAGER',
      },
    ],
  },
  {
    // `/production/orders` is a one-line re-export of `/production-orders`.
    // Both are live and linked from different places, so one key owns both.
    key: 'production-orders',
    label: 'Production Orders',
    description: 'Branch production orders and approvals',
    routes: ['/production-orders', '/production/orders'],
    nav: { group: 'Operations', href: '/production/orders', label: 'Prod. Orders', order: 24 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create order',
        description: 'Raise a branch production order',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit order',
        description: 'Amend or finalise an order',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete order',
        description: 'Remove a production order',
        minRole: 'MANAGER',
      },
    ],
    panels: [
      {
        id: 'suggestions',
        label: 'Order suggestions',
        description: 'Suggested quantities derived from recent sales',
        sensitivity: 'sensitive',
      },
      {
        id: 'planned-yield',
        label: 'Planned yield',
        description: 'Aggregate planned yield across orders',
        sensitivity: 'sensitive',
      },
    ],
  },
  {
    // Kept as a top-level key so the existing `/production-cost` screen and its
    // stored permission rows keep working, but it is really a view onto
    // production data - hence the paired panel on `production`.
    key: 'production-cost',
    label: 'Production Cost',
    description: 'Cost-per-unit breakdown by product and branch',
    routes: ['/production-cost'],
    nav: { group: 'Operations', href: '/production-cost', label: 'Prod. Cost', order: 25 },
    platform: 'web',
  },
  {
    key: 'production-efficiency',
    label: 'Production Efficiency',
    description: 'Planned versus actual yield analysis',
    routes: ['/production-efficiency'],
    nav: { group: 'Operations', href: '/production-efficiency', label: 'Prod. Efficiency', order: 26 },
    platform: 'web',
  },
  {
    key: 'inventory-import',
    label: 'Inventory Import',
    description: 'Spreadsheet import and its history log',
    routes: ['/inventory-import'],
    nav: { group: 'Operations', href: '/inventory-import/history', label: 'Import History', order: 27 },
    platform: 'web',
    actions: [
      {
        id: 'preview',
        label: 'Preview a file',
        description: 'Parse a spreadsheet and show what would be imported',
        minRole: 'MANAGER',
      },
      {
        id: 'import',
        label: 'Commit an import',
        description: 'Write a previewed spreadsheet into inventory',
        minRole: 'MANAGER',
      },
      {
        id: 'delete-log',
        label: 'Delete a log entry',
        description: 'Remove an import history record',
        minRole: 'ADMIN',
      },
    ],
  },

  // -- Stock ----------------------------------------------------------------
  {
    key: 'material-stock',
    label: 'Material Stock',
    description: 'Raw material stock levels and gaps',
    routes: ['/material-inventory'],
    nav: { group: 'Stock', href: '/material-inventory', label: 'Material Stock', order: 30 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Record stock',
        description: 'Add material stock rows, singly or in bulk',
        minRole: 'INVENTORY',
      },
      {
        id: 'edit',
        label: 'Edit stock',
        description: 'Amend a material stock row',
        minRole: 'INVENTORY',
      },
      {
        id: 'delete',
        label: 'Delete stock',
        description: 'Remove a material stock row',
        minRole: 'INVENTORY',
      },
      {
        id: 'init',
        label: 'Initialise a period',
        description: 'Seed stock rows for a date or date range',
        minRole: 'INVENTORY',
      },
      {
        id: 'adjust',
        label: 'Adjust stock',
        description: 'Record or remove a material stock adjustment',
        minRole: 'INVENTORY',
      },
    ],
  },

  // -- Catalog --------------------------------------------------------------
  {
    key: 'products',
    label: 'Products',
    description: 'Product catalog and pricing',
    routes: ['/products'],
    nav: { group: 'Catalog', href: '/products', label: 'Products', order: 40 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create products',
        description: 'Add products, singly or in bulk',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit products',
        description: 'Amend a product, including its price',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete products',
        description: 'Remove a product from the catalog',
        minRole: 'MANAGER',
      },
    ],
    panels: [
      {
        id: 'price-history',
        label: 'Price history',
        description: 'Historical selling prices for a product',
        sensitivity: 'sensitive',
      },
    ],
  },
  {
    key: 'materials',
    label: 'Materials',
    description: 'Raw material catalog and price history',
    routes: ['/materials'],
    nav: { group: 'Catalog', href: '/materials', label: 'Materials', order: 41 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create materials',
        description: 'Add materials, singly or in bulk',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit materials',
        description: 'Amend a material, including its cost',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete materials',
        description: 'Remove a material from the catalog',
        minRole: 'MANAGER',
      },
    ],
    panels: [
      {
        id: 'price-history',
        label: 'Cost history',
        description: 'Historical purchase costs for a material',
        sensitivity: 'sensitive',
      },
    ],
  },
  {
    key: 'recipes',
    label: 'Recipes',
    description: 'Product recipes and costing',
    routes: ['/recipes'],
    nav: { group: 'Catalog', href: '/recipes', label: 'Recipes', order: 42 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create recipes',
        description: 'Define a new product recipe',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit recipes',
        description: 'Amend a recipe and its ingredients',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete recipes',
        description: 'Remove a recipe',
        minRole: 'MANAGER',
      },
    ],
    panels: [
      {
        id: 'cost',
        label: 'Recipe costing',
        description: 'Computed material cost per unit for a recipe',
        sensitivity: 'sensitive',
      },
    ],
  },
  {
    key: 'branches',
    label: 'Branches',
    description: 'Branch directory and configuration',
    routes: ['/branches'],
    nav: { group: 'Catalog', href: '/branches', label: 'Branches', order: 43 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create branches',
        description: 'Add a branch to the directory',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit branches',
        description: 'Amend branch details',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete branches',
        description: 'Remove a branch',
        minRole: 'MANAGER',
      },
    ],
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    description: 'Supplier directory',
    routes: ['/suppliers'],
    nav: { group: 'Catalog', href: '/suppliers', label: 'Suppliers', order: 44 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create suppliers',
        description: 'Add a supplier',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit suppliers',
        description: 'Amend supplier details',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete suppliers',
        description: 'Remove a supplier',
        minRole: 'MANAGER',
      },
    ],
  },
  {
    key: 'unit-conversions',
    label: 'Unit Conversions',
    description: 'Measurement unit conversion rules',
    routes: ['/unit-conversions'],
    nav: { group: 'Catalog', href: '/unit-conversions', label: 'Unit Conversions', order: 45 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Create conversions',
        description: 'Add a unit conversion rule',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit conversions',
        description: 'Amend a conversion rule',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Delete conversions',
        description: 'Remove a conversion rule',
        minRole: 'MANAGER',
      },
    ],
  },

  // -- Config ---------------------------------------------------------------
  {
    key: 'product-order-config',
    label: 'Product Order Config',
    description: 'Display ordering of products across sheets',
    routes: ['/config'],
    nav: { group: 'Config', href: '/config/product-order', label: 'Product Order', order: 50 },
    platform: 'web',
    actions: [
      {
        id: 'edit',
        label: 'Reorder products',
        description: 'Change the display order products appear in',
        minRole: 'MANAGER',
      },
    ],
  },

  // -- Settings -------------------------------------------------------------
  {
    key: 'user-management',
    label: 'User Management',
    description: 'Create and manage accounts, roles and branches',
    routes: ['/settings/users'],
    nav: { group: 'Settings', href: '/settings/users', label: 'Users', order: 60 },
    platform: 'both',
    actions: [
      {
        id: 'create',
        label: 'Create accounts',
        description: 'Register a new user account',
        minRole: 'ADMIN',
      },
      {
        id: 'set-role',
        label: 'Change roles',
        description: "Change an account's role",
        minRole: 'ADMIN',
      },
      {
        id: 'set-branch',
        label: 'Assign branches',
        description: "Change an account's branch assignment",
        minRole: 'ADMIN',
      },
      {
        id: 'set-status',
        label: 'Activate / deactivate',
        description: 'Enable or disable an account',
        minRole: 'ADMIN',
      },
      {
        id: 'reset-password',
        label: 'Reset passwords',
        description: 'Issue a temporary password for an account',
        minRole: 'ADMIN',
      },
    ],
  },
  {
    // Split from `user-management`: editing the matrix is privilege escalation,
    // so it is grantable separately from day-to-day account administration.
    key: 'permissions',
    label: 'Permissions',
    description: 'Role and per-user feature permission matrix',
    routes: ['/settings/permissions'],
    nav: { group: 'Settings', href: '/settings/permissions', label: 'Permissions', order: 61 },
    platform: 'web',
    actions: [
      {
        id: 'edit',
        label: 'Change permissions',
        description: 'Write role and per-user permission overrides',
        minRole: 'ADMIN',
      },
    ],
  },
  {
    key: 'jobs',
    label: 'Jobs',
    description: 'Scheduled job runs and on-demand autofill',
    routes: ['/settings/jobs'],
    nav: { group: 'Settings', href: '/settings/jobs', label: 'Jobs', order: 62 },
    platform: 'web',
    actions: [
      {
        id: 'run',
        label: 'Run jobs on demand',
        description: 'Trigger autofill and material-stock autofill jobs',
        minRole: 'MANAGER',
      },
    ],
  },

  // -- Cross-cutting (no screen of its own) ---------------------------------
  {
    // Drives BranchGuard. Absence means "scoped to your own branch"; the guard
    // fails closed, so a user without this key and without a branch assignment
    // is denied rather than waved through. See branch.guard.ts.
    key: 'all-branches',
    label: 'All Branches',
    description:
      'See and act on data for every branch. Without this, a user is confined to the branch assigned to their account.',
    routes: [],
    platform: 'both',
  },

  // -- Mobile-only (no web route) -------------------------------------------
  {
    key: 'quick-entry',
    label: 'Quick Entry',
    description: 'Fast daily inventory entry sheet (mobile)',
    routes: [],
    platform: 'mobile',
  },
  {
    key: 'branch-comparison',
    label: 'Branch Comparison',
    description: 'Side-by-side branch performance (mobile)',
    routes: [],
    platform: 'mobile',
  },
  {
    key: 'waste-report',
    label: 'Waste Report',
    description: 'Reject and leftover analysis (mobile)',
    routes: [],
    platform: 'mobile',
  },
  {
    key: 'low-stock',
    label: 'Low Stock',
    description: 'Materials at or below reorder level (mobile)',
    routes: [],
    platform: 'mobile',
  },
  {
    key: 'approval-queue',
    label: 'Approval Queue',
    description: 'Adjustments and orders awaiting approval (mobile)',
    routes: [],
    platform: 'mobile',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Push notification delivery and history (mobile)',
    routes: [],
    platform: 'mobile',
  },
] as const satisfies readonly FeatureDef[];

/** Union of every valid feature (screen-level) key. */
export type FeatureKey = (typeof FEATURES)[number]['key'];

type FeatureUnion = (typeof FEATURES)[number];

/** `'products:create' | 'products:delete' | ...` derived from the const entries. */
type ActionKeyOf<F> = F extends {
  key: infer K extends string;
  actions: readonly (infer A)[];
}
  ? A extends { id: infer I extends string }
    ? `${K}:${I}`
    : never
  : never;

type PanelKeyOf<F> = F extends {
  key: infer K extends string;
  panels: readonly (infer P)[];
}
  ? P extends { id: infer I extends string }
    ? `${K}:${I}`
    : never
  : never;

export type ActionKey = ActionKeyOf<FeatureUnion>;
export type PanelKey = PanelKeyOf<FeatureUnion>;

/**
 * Every grantable key: features, actions and panels in one flat union.
 *
 * This is what `@RequireFeature()` accepts, what the `Feature` table stores and
 * what travels in `permissions: string[]`. A typo is a type error.
 */
export type PermissionKey = FeatureKey | ActionKey | PanelKey;

/**
 * The same entries widened to `FeatureDef`.
 *
 * `FEATURES` is declared `as const` so `FeatureKey` can be a literal union, but
 * that also narrows each entry to its exact shape - and mobile-only entries have
 * no `nav` property at all, so iterating the const union cannot read `.nav`.
 * Iterate this; use `FEATURES` only to derive types.
 */
export const FEATURE_LIST: readonly FeatureDef[] = FEATURES;

/**
 * The ten keys the Flutter app mirrors. Renaming or removing any of these
 * breaks the shipped mobile build; a conformance test asserts they survive.
 */
export const MOBILE_CONTRACT_KEYS = [
  'quick-entry',
  'inventory-history',
  'dashboard',
  'branch-comparison',
  'waste-report',
  'low-stock',
  'notifications',
  'approval-queue',
  'analytics',
  'user-management',
] as const;

/**
 * The key that lifts branch scoping. Named because `BranchGuard` keys off it and
 * a typo there would silently unscope every request rather than fail loudly.
 */
export const ALL_BRANCHES_KEY = 'all-branches' satisfies FeatureKey;

/** Composes a child key. The one place the `:` separator is spelled out. */
export function permissionKey(featureKey: string, childId: string): string {
  return `${featureKey}:${childId}`;
}

/** The feature key a child belongs to, or null if `key` is itself a feature. */
export function parentKeyOf(key: string): string | null {
  const index = key.indexOf(':');
  return index === -1 ? null : key.slice(0, index);
}

/** Flat metadata for one grantable key, used by the seed and the admin matrix. */
export type PermissionDef = {
  key: string;
  label: string;
  description: string;
  /** Null for a feature key; the owning feature for an action or panel. */
  parent: string | null;
  kind: 'feature' | 'action' | 'panel';
  /** Actions only. */
  minRole?: RoleName;
  /** Panels only. */
  sensitivity?: PanelDef['sensitivity'];
};

/**
 * Every grantable key in manifest order, features immediately followed by their
 * own children. Drives the `Feature` table seed and the admin matrix.
 */
export const PERMISSION_LIST: readonly PermissionDef[] = FEATURE_LIST.flatMap((f) => [
  {
    key: f.key,
    label: f.label,
    description: f.description,
    parent: null,
    kind: 'feature' as const,
  },
  ...(f.actions ?? []).map((a) => ({
    key: permissionKey(f.key, a.id),
    label: a.label,
    description: a.description,
    parent: f.key,
    kind: 'action' as const,
    minRole: a.minRole,
  })),
  ...(f.panels ?? []).map((p) => ({
    key: permissionKey(f.key, p.id),
    label: p.label,
    description: p.description,
    parent: f.key,
    kind: 'panel' as const,
    sensitivity: p.sensitivity,
  })),
]);

export const PERMISSION_BY_KEY: ReadonlyMap<string, PermissionDef> = new Map(
  PERMISSION_LIST.map((p) => [p.key, p]),
);

export const PERMISSION_KEYS: readonly string[] = PERMISSION_LIST.map((p) => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_BY_KEY.has(value);
}

/**
 * Baseline grants per role, layered under RoleFeaturePermission and then
 * UserFeaturePermission overrides.
 *
 * ## MANAGER is deliberately small
 *
 * Branch managers previously defaulted to 21 of the 26 features, which made
 * "limited access" something an admin had to achieve by revoking sixteen things
 * they might forget. The default is now a branch-operations core: enter and
 * correct their own branch's numbers, and see their own branch's dashboard.
 * Everything else - the catalog, recipes, costs, suppliers, imports, jobs,
 * cross-branch reporting, and every `delete` - is a deliberate grant.
 *
 * Note what is absent: no `:delete` action for any role below ADMIN, and no
 * `all-branches` for MANAGER.
 *
 * ## all-branches reproduces today's behaviour exactly
 *
 * `BranchGuard` only ever scoped MANAGER, so every other role is granted
 * `all-branches` here to keep behaviour identical on the day this ships.
 * INVENTORY is a likely candidate to scope as well - but that is now a switch
 * an admin can flip rather than a decision buried in a guard.
 */
export const ROLE_DEFAULTS: Record<RoleName, readonly PermissionKey[]> = {
  USER: [],
  // A read-only head-office role. It keeps every dashboard panel it could see
  // before this change: narrowing is aimed at MANAGER, and silently taking
  // revenue or wastage away from VIEWER would be a regression, not a decision.
  VIEWER: [
    'dashboard',
    'dashboard:kpis',
    'dashboard:revenue-trend',
    'dashboard:production-mix',
    'dashboard:branch-orders',
    'dashboard:branch-gaps',
    'dashboard:low-stock',
    'dashboard:rejections',
    'analytics',
    'all-branches',
  ],
  INVENTORY: [
    'dashboard',
    'dashboard:kpis',
    'dashboard:production-mix',
    'dashboard:low-stock',
    'dashboard:branch-gaps',
    'dashboard:branch-orders',
    'quick-entry',
    'inventory-history',
    'inventory-history:create',
    'inventory-history:edit',
    'inventory-history:delete',
    'inventory-history:recascade',
    'inventory-history:gaps',
    'inventory-adjustments',
    'inventory-adjustments:create',
    'inventory-adjustments:transfer',
    'inventory-adjustments:edit',
    'inventory-adjustments:delete',
    'notifications',
    'all-branches',
  ],
  MANAGER: [
    'dashboard',
    'dashboard:kpis',
    'dashboard:production-mix',
    'dashboard:low-stock',
    // Their own branch's draft/finalised counts: they raise these orders, so
    // the card is part of the daily job. Revenue, wastage and the cross-branch
    // coverage roster are not, and stay off until an admin grants them.
    'dashboard:branch-orders',
    'quick-entry',
    'inventory-history',
    'inventory-history:create',
    'inventory-history:edit',
    'inventory-adjustments',
    'inventory-adjustments:create',
    'inventory-adjustments:transfer',
    'production',
    'production:create',
    'production:edit',
    'production-orders',
    'production-orders:create',
    'production-orders:edit',
    'material-stock',
    'material-stock:create',
    'material-stock:edit',
    'notifications',
    'low-stock',
    'approval-queue',
  ],
  // Everything except the two orphan report pages, which nothing links to and
  // which stay URL-only until an admin deliberately switches them on.
  ADMIN: PERMISSION_KEYS.filter(
    (k) => k !== 'production-cost' && k !== 'production-efficiency',
  ) as readonly PermissionKey[],
};

/**
 * Keys an ADMIN may never have revoked. Disabling any would make the screen
 * that undoes the change unreachable, recoverable only by hand-written SQL.
 */
export const ADMIN_LOCKED_KEYS: readonly PermissionKey[] = [
  'permissions',
  'permissions:edit',
  'user-management',
];

export const FEATURE_BY_KEY: ReadonlyMap<string, FeatureDef> = new Map(
  FEATURE_LIST.map((f) => [f.key, f]),
);

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_BY_KEY.has(value);
}

/**
 * Drops child keys whose parent feature is not held.
 *
 * A `products:delete` grant means nothing to someone who cannot reach Products,
 * and letting the pair persist would let the matrix express states the UI and
 * the guards would disagree about. Applied once, server-side, when a user's
 * effective permissions are resolved.
 */
export function enforceParentRule(keys: readonly string[]): string[] {
  const held = new Set(keys);
  return keys.filter((key) => {
    const parent = parentKeyOf(key);
    return parent === null || held.has(parent);
  });
}

/** True when `permissions` grants `key`, honouring the parent rule. */
export function hasPermission(permissions: readonly string[], key: string): boolean {
  if (!permissions.includes(key)) return false;
  const parent = parentKeyOf(key);
  return parent === null || permissions.includes(parent);
}

/** True when `pathname` equals `prefix` or sits beneath it. */
export function prefixMatches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

/**
 * The feature governing `pathname`, or null if the route is ungated.
 *
 * Matches the LONGEST prefix, not the first. `/settings/jobs` must resolve to
 * `jobs` even though a shorter `/settings` prefix would also match - first-match
 * ordering is what previously bounced managers who clicked Jobs.
 */
export function featureForPath(pathname: string): FeatureDef | null {
  let best: FeatureDef | null = null;
  let bestLength = -1;
  for (const feature of FEATURE_LIST) {
    for (const prefix of feature.routes) {
      if (prefixMatches(pathname, prefix) && prefix.length > bestLength) {
        best = feature;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

/** Whether `permissions` grants access to `pathname`. Ungated routes are open. */
export function canAccessPath(pathname: string, permissions: readonly string[]): boolean {
  const feature = featureForPath(pathname);
  return feature === null || permissions.includes(feature.key);
}

/**
 * Where to send a user who has just logged in, or who was denied a route.
 *
 * Resolves the lowest-ordered nav destination the user actually holds, so no
 * role can be redirected into a route it is denied. Returns `/no-access` when
 * the user holds no nav destination at all.
 */
export function firstPermittedRoute(permissions: readonly string[]): string {
  const destinations = FEATURE_LIST.filter(
    (f): f is FeatureDef & { nav: NonNullable<FeatureDef['nav']> } =>
      f.nav !== undefined && permissions.includes(f.key),
  ).sort((a, b) => a.nav.order - b.nav.order);

  return destinations[0]?.nav.href ?? '/no-access';
}

/** Nav destinations the given permissions unlock, grouped and ordered for the sidebar. */
export function navigationFor(
  permissions: readonly string[],
): { group: NavGroup; items: { key: string; href: string; label: string }[] }[] {
  const order: NavGroup[] = ['Overview', 'Operations', 'Stock', 'Catalog', 'Config', 'Settings'];
  const byGroup = new Map<NavGroup, { key: string; href: string; label: string; order: number }[]>();

  for (const feature of FEATURE_LIST) {
    if (!feature.nav || !permissions.includes(feature.key)) continue;
    const bucket = byGroup.get(feature.nav.group) ?? [];
    bucket.push({
      key: feature.key,
      href: feature.nav.href,
      label: feature.nav.label,
      order: feature.nav.order,
    });
    byGroup.set(feature.nav.group, bucket);
  }

  return order
    .filter((g) => (byGroup.get(g)?.length ?? 0) > 0)
    .map((group) => ({
      group,
      items: byGroup
        .get(group)!
        .sort((a, b) => a.order - b.order)
        .map(({ key, href, label }) => ({ key, href, label })),
    }));
}
