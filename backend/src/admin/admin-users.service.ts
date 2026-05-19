import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createPgPool } from "../users/db-pool";
import type { UserRole } from "../users/user-role";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

type UserAdminRow = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  status: string;
  created_at: Date;
};

@Injectable()
export class AdminUsersService {
  private readonly db = createPgPool();

  async listAll() {
    const result = await this.db.query<UserAdminRow>(
      `SELECT id, username, display_name, role, status, created_at
       FROM users
       ORDER BY username ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at
    }));
  }

  async create(dto: CreateUserDto) {
    const existing = await this.db.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1`, [
      dto.username.trim()
    ]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new BadRequestException("Username already exists");
    }

    const id = randomUUID();
    await this.db.query(
      `INSERT INTO users (id, username, password, display_name, role, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [id, dto.username.trim(), dto.password, dto.displayName.trim(), dto.role]
    );

    return { id, username: dto.username.trim(), displayName: dto.displayName.trim(), role: dto.role, status: "active" };
  }

  async update(actorId: string, userId: string, dto: UpdateUserDto) {
    const current = await this.db.query<UserAdminRow>(
      `SELECT id, username, display_name, role, status FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new NotFoundException("User not found");
    }
    if (userId === actorId && dto.status === "disabled") {
      throw new BadRequestException("You cannot disable your own account");
    }
    if (userId === actorId && dto.role && dto.role !== row.role) {
      throw new BadRequestException("You cannot change your own role");
    }

    await this.db.query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           role = COALESCE($3, role),
           password = COALESCE($4, password),
           status = COALESCE($5, status)
       WHERE id = $1`,
      [
        userId,
        dto.displayName?.trim() ?? null,
        dto.role ?? null,
        dto.password ?? null,
        dto.status ?? null
      ]
    );

    const updated = await this.db.query<UserAdminRow>(
      `SELECT id, username, display_name, role, status, created_at FROM users WHERE id = $1`,
      [userId]
    );
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
}
