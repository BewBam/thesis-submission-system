"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUsersService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const db_pool_1 = require("../users/db-pool");
let AdminUsersService = class AdminUsersService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
    }
    async listAll() {
        const result = await this.db.query(`SELECT id, username, display_name, role, status, created_at
       FROM users
       ORDER BY username ASC`);
        return result.rows.map((row) => ({
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            role: row.role,
            status: row.status,
            createdAt: row.created_at
        }));
    }
    async create(dto) {
        const existing = await this.db.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1`, [
            dto.username.trim()
        ]);
        if (existing.rowCount && existing.rowCount > 0) {
            throw new common_1.BadRequestException("Username already exists");
        }
        const id = (0, node_crypto_1.randomUUID)();
        await this.db.query(`INSERT INTO users (id, username, password, display_name, role, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`, [id, dto.username.trim(), dto.password, dto.displayName.trim(), dto.role]);
        return { id, username: dto.username.trim(), displayName: dto.displayName.trim(), role: dto.role, status: "active" };
    }
    async update(actorId, userId, dto) {
        const current = await this.db.query(`SELECT id, username, display_name, role, status FROM users WHERE id = $1 LIMIT 1`, [userId]);
        const row = current.rows[0];
        if (!row) {
            throw new common_1.NotFoundException("User not found");
        }
        if (userId === actorId && dto.status === "disabled") {
            throw new common_1.BadRequestException("You cannot disable your own account");
        }
        if (userId === actorId && dto.role && dto.role !== row.role) {
            throw new common_1.BadRequestException("You cannot change your own role");
        }
        await this.db.query(`UPDATE users
       SET display_name = COALESCE($2, display_name),
           role = COALESCE($3, role),
           password = COALESCE($4, password),
           status = COALESCE($5, status)
       WHERE id = $1`, [
            userId,
            dto.displayName?.trim() ?? null,
            dto.role ?? null,
            dto.password ?? null,
            dto.status ?? null
        ]);
        const updated = await this.db.query(`SELECT id, username, display_name, role, status, created_at FROM users WHERE id = $1`, [userId]);
        const u = updated.rows[0];
        return {
            id: u.id,
            username: u.username,
            displayName: u.display_name,
            role: u.role,
            status: u.status,
            createdAt: u.created_at
        };
    }
};
exports.AdminUsersService = AdminUsersService;
exports.AdminUsersService = AdminUsersService = __decorate([
    (0, common_1.Injectable)()
], AdminUsersService);
//# sourceMappingURL=admin-users.service.js.map