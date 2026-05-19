"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminRolesService = void 0;
const common_1 = require("@nestjs/common");
const db_pool_1 = require("../users/db-pool");
const permissions_1 = require("../users/permissions");
const user_role_1 = require("../users/user-role");
let AdminRolesService = class AdminRolesService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
    }
    async listRolesWithPermissions() {
        const result = await this.db.query(`SELECT role, permission, allowed FROM role_permissions ORDER BY role, permission`);
        const byRole = {};
        for (const role of user_role_1.USER_ROLES) {
            byRole[role] = { role, permissions: {} };
            for (const permission of permissions_1.PERMISSIONS) {
                byRole[role].permissions[permission] = false;
            }
        }
        for (const row of result.rows) {
            if (byRole[row.role]) {
                byRole[row.role].permissions[row.permission] = row.allowed;
            }
        }
        return user_role_1.USER_ROLES.map((role) => byRole[role]);
    }
    async updateRolePermissions(role, permissions) {
        if (!(0, user_role_1.isUserRole)(role)) {
            throw new common_1.BadRequestException(`Invalid role: ${role}`);
        }
        const keys = Object.keys(permissions);
        for (const key of keys) {
            if (!permissions_1.PERMISSIONS.includes(key)) {
                throw new common_1.BadRequestException(`Unknown permission: ${key}`);
            }
            if (typeof permissions[key] !== "boolean") {
                throw new common_1.BadRequestException(`Permission ${key} must be a boolean`);
            }
        }
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            for (const permission of permissions_1.PERMISSIONS) {
                const allowed = Boolean(permissions[permission]);
                await client.query(`INSERT INTO role_permissions (role, permission, allowed)
           VALUES ($1, $2, $3)
           ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed`, [role, permission, allowed]);
            }
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
        return this.listRolesWithPermissions().then((roles) => roles.find((r) => r.role === role));
    }
};
exports.AdminRolesService = AdminRolesService;
exports.AdminRolesService = AdminRolesService = __decorate([
    (0, common_1.Injectable)()
], AdminRolesService);
//# sourceMappingURL=admin-roles.service.js.map