import { ROLE_DEFAULTS } from '@/lib/rbac/features';
import { resolvePermissions } from './resolve-permissions';

describe('resolvePermissions', () => {
  it('falls back to the role defaults when nothing is overridden', () => {
    expect(resolvePermissions('VIEWER', [], []).sort()).toEqual(
      [...ROLE_DEFAULTS.VIEWER].sort(),
    );
  });

  it('grants nothing to an unprovisioned USER', () => {
    expect(resolvePermissions('USER', [], [])).toEqual([]);
  });

  it('lets a role override grant a key the defaults withhold', () => {
    const result = resolvePermissions('VIEWER', [{ k: 'products', e: true }], []);
    expect(result).toContain('products');
  });

  it('lets a role override revoke a key the defaults grant', () => {
    const result = resolvePermissions('VIEWER', [{ k: 'dashboard', e: false }], []);
    expect(result).not.toContain('dashboard');
  });

  it('lets a user override beat the role override', () => {
    // Precedence is defaults -> role -> user, so the last word is the user's.
    const granted = resolvePermissions(
      'VIEWER',
      [{ k: 'products', e: true }],
      [{ k: 'products', e: false }],
    );
    expect(granted).not.toContain('products');

    const revoked = resolvePermissions(
      'VIEWER',
      [{ k: 'dashboard', e: false }],
      [{ k: 'dashboard', e: true }],
    );
    expect(revoked).toContain('dashboard');
  });

  it('leaves untouched keys alone when overriding another', () => {
    const result = resolvePermissions('MANAGER', [], [{ k: 'production', e: false }]);
    expect(result).not.toContain('production');
    expect(result).toContain('inventory-history');
  });

  describe('parent rule', () => {
    // A child key means nothing without the screen it belongs to. Enforcing it
    // here rather than at each call site means the guards, the sidebar and the
    // admin matrix cannot disagree about what a half-granted pair means.
    it('drops a child whose parent is revoked', () => {
      const result = resolvePermissions('MANAGER', [], [{ k: 'production', e: false }]);
      expect(result).not.toContain('production:create');
      expect(result).not.toContain('production:edit');
    });

    it('drops a child granted without its parent', () => {
      const result = resolvePermissions('VIEWER', [], [{ k: 'products:delete', e: true }]);
      expect(result).not.toContain('products:delete');
    });

    it('keeps a child when the same override set also grants the parent', () => {
      const result = resolvePermissions('VIEWER', [], [
        { k: 'products', e: true },
        { k: 'products:delete', e: true },
      ]);
      expect(result).toContain('products');
      expect(result).toContain('products:delete');
    });

    it('leaves parentless feature keys untouched', () => {
      const result = resolvePermissions('MANAGER', [], []);
      expect(result).toContain('production');
      expect(result).toContain('production:create');
    });
  });

  it('returns no duplicates when an override re-grants a default', () => {
    const result = resolvePermissions('VIEWER', [{ k: 'dashboard', e: true }], []);
    expect(result.filter((k) => k === 'dashboard')).toHaveLength(1);
  });

  it('gives INVENTORY the dashboard it needs to have somewhere to land', () => {
    // Without this the login redirect and the denial redirect both pointed at a
    // route the role was denied, so it bounced between them indefinitely.
    expect(resolvePermissions('INVENTORY', [], [])).toContain('dashboard');
  });
});
