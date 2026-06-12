export const ROLE_ORDER: Record<string, number> = {
  USER: 0, VIEWER: 1, INVENTORY: 2, MANAGER: 3, ADMIN: 4,
};

export function meetsMinRole(userRole: string | undefined, minRole: string): boolean {
  return (ROLE_ORDER[userRole ?? ''] ?? -1) >= (ROLE_ORDER[minRole] ?? Infinity);
}
