import { Injectable } from "@nestjs/common";
import { createPgPool } from "./db-pool";

export type UserRole = "student" | "reviewer" | "admin";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}

type UserRow = {
  id: string;
  username: string;
  password: string;
  display_name: string;
  role: UserRole;
};

function mapRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    password: row.password,
    role: row.role
  };
}

@Injectable()
export class UsersService {
  private readonly db = createPgPool();

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `SELECT id, username, password, display_name, role
       FROM users
       WHERE lower(username) = lower($1)
       LIMIT 1`,
      [username]
    );
    const row = result.rows[0];
    return row ? mapRow(row) : undefined;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `SELECT id, username, password, display_name, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapRow(row) : undefined;
  }

  async listByRole(role: UserRole) {
    const result = await this.db.query<Pick<UserRow, "id" | "username" | "display_name" | "role">>(
      `SELECT id, username, display_name, role
       FROM users
       WHERE role = $1
       ORDER BY username ASC`,
      [role]
    );
    return result.rows.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role
    }));
  }
}
