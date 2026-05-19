import { BadRequestException, Injectable } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";
import { PERMISSIONS, type Permission } from "../users/permissions";
import { USER_ROLES, type UserRole, isUserRole } from "../users/user-role";

@Injectable()
export class AdminRolesService {
  private readonly db = createPgPool();

  async listRolesWithPermissions() {
    const result = await this.db.query<{ role: UserRole; permission: string; allowed: boolean }>(
      `SELECT role, permission, allowed FROM role_permissions ORDER BY role, permission`
    );

    const byRole: Record<string, { role: UserRole; permissions: Record<string, boolean> }> = {};
    for (const role of USER_ROLES) {
      byRole[role] = { role, permissions: {} };
      for (const permission of PERMISSIONS) {
        byRole[role].permissions[permission] = false;
      }
    }

    for (const row of result.rows) {
      if (byRole[row.role]) {
        byRole[row.role].permissions[row.permission] = row.allowed;
      }
    }

    return USER_ROLES.map((role) => byRole[role]);
  }

  async updateRolePermissions(role: string, permissions: Record<string, boolean>) {
    if (!isUserRole(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    const keys = Object.keys(permissions);
    for (const key of keys) {
      if (!(PERMISSIONS as readonly string[]).includes(key)) {
        throw new BadRequestException(`Unknown permission: ${key}`);
      }
      if (typeof permissions[key] !== "boolean") {
        throw new BadRequestException(`Permission ${key} must be a boolean`);
      }
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      for (const permission of PERMISSIONS) {
        const allowed = Boolean(permissions[permission]);
        await client.query(
          `INSERT INTO role_permissions (role, permission, allowed)
           VALUES ($1, $2, $3)
           ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed`,
          [role, permission, allowed]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return this.listRolesWithPermissions().then((roles) => roles.find((r) => r.role === role));
  }
}
