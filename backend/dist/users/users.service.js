"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const db_pool_1 = require("./db-pool");
function mapRow(row) {
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        password: row.password,
        role: row.role,
        status: row.status ?? "active"
    };
}
let UsersService = class UsersService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
    }
    async findByUsername(username) {
        const result = await this.db.query(`SELECT id, username, password, display_name, role, status
       FROM users
       WHERE lower(username) = lower($1)
       LIMIT 1`, [username]);
        const row = result.rows[0];
        return row ? mapRow(row) : undefined;
    }
    async findById(id) {
        const result = await this.db.query(`SELECT id, username, password, display_name, role, status
       FROM users
       WHERE id = $1
       LIMIT 1`, [id]);
        const row = result.rows[0];
        return row ? mapRow(row) : undefined;
    }
    async listByRole(role) {
        const result = await this.db.query(`SELECT id, username, display_name, role
       FROM users
       WHERE role = $1 AND status = 'active'
       ORDER BY username ASC`, [role]);
        return result.rows.map((row) => ({
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            role: row.role
        }));
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)()
], UsersService);
//# sourceMappingURL=users.service.js.map