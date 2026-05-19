"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminSettingsService = void 0;
const common_1 = require("@nestjs/common");
const db_pool_1 = require("../users/db-pool");
let AdminSettingsService = class AdminSettingsService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
    }
    async list() {
        const result = await this.db.query(`SELECT key, value, description, updated_at FROM system_settings ORDER BY key ASC`);
        return result.rows.map((row) => ({
            key: row.key,
            value: row.value,
            description: row.description,
            updatedAt: row.updated_at
        }));
    }
    async update(settings) {
        const keys = Object.keys(settings);
        if (keys.length === 0) {
            throw new common_1.BadRequestException("No settings provided");
        }
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            for (const key of keys) {
                const updated = await client.query(`UPDATE system_settings SET value = $2, updated_at = NOW() WHERE key = $1 RETURNING key`, [key, String(settings[key])]);
                if (updated.rowCount === 0) {
                    throw new common_1.BadRequestException(`Unknown setting key: ${key}`);
                }
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
        return this.list();
    }
    async getValue(key) {
        const result = await this.db.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [key]);
        return result.rows[0]?.value;
    }
};
exports.AdminSettingsService = AdminSettingsService;
exports.AdminSettingsService = AdminSettingsService = __decorate([
    (0, common_1.Injectable)()
], AdminSettingsService);
//# sourceMappingURL=admin-settings.service.js.map