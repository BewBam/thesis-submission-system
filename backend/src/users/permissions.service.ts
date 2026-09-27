import { Injectable } from "@nestjs/common";
import { createPgPool } from "./db-pool";
import type { Permission } from "./permissions";
import type { UserRole } from "./user-role";

type CacheEntry = {
  allowed: Set<string>;
  loadedAt: number;
};

const CACHE_TTL_MS = 30_000;

@Injectable()
export class PermissionsService {
  private readonly db = createPgPool();
  private readonly cache = new Map<string, CacheEntry>();

  invalidateCache(role?: UserRole | string) {
    if (role) {
      this.cache.delete(role);
      return;
    }
    this.cache.clear();
  }

  async getAllowedPermissions(role: string): Promise<Set<string>> {
    const cached = this.cache.get(role);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.allowed;
    }

    const result = await this.db.query<{ permission: string }>(
      `SELECT permission
       FROM role_permissions
       WHERE role = $1 AND allowed = TRUE`,
      [role]
    );
    const allowed = new Set(result.rows.map((row) => row.permission));
    this.cache.set(role, { allowed, loadedAt: Date.now() });
    return allowed;
  }

  async roleHasAnyPermission(role: string, permissions: Permission[]): Promise<boolean> {
    if (!permissions.length) {
      return true;
    }
    const allowed = await this.getAllowedPermissions(role);
    return permissions.some((permission) => allowed.has(permission));
  }
}
