import { Injectable } from "@nestjs/common";
import { createPgPool } from "./db-pool";
import type { UserRole } from "./user-role";

export type { UserRole } from "./user-role";

export function portalEmail(username: string): string {
  const local = username.trim().toLowerCase().split("@")[0];
  return `${local}@hcmut.edu.vn`;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  password: string | null;
  role: UserRole;
  status: "active" | "disabled";
  email: string;
  authSource: "local" | "google";
  facultyId: string | null;
  facultyName: string | null;
}

type UserRow = {
  username: string;
  password: string | null;
  display_name: string;
  role: UserRole;
  status: "active" | "disabled";
  auth_source: "local" | "google";
  faculty_id: string | null;
  faculty_name: string | null;
};

function mapRow(row: UserRow): UserRecord {
  return {
    id: row.username,
    username: row.username,
    displayName: row.display_name,
    password: row.password,
    role: row.role,
    status: row.status ?? "active",
    email: portalEmail(row.username),
    authSource: row.auth_source ?? "local",
    facultyId: row.faculty_id,
    facultyName: row.faculty_name
  };
}

const USER_SELECT = `SELECT u.username, u.password, u.display_name, u.role, u.status, u.auth_source,
              u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id`;

@Injectable()
export class UsersService {
  private readonly db = createPgPool();

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `${USER_SELECT}
       WHERE lower(u.username) = lower($1)
       LIMIT 1`,
      [username]
    );
    const row = result.rows[0];
    return row ? mapRow(row) : undefined;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const local = email.trim().toLowerCase().split("@")[0];
    if (!local) {
      return undefined;
    }
    return this.findByUsername(local);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return this.findByUsername(id);
  }

  async updatePassword(username: string, password: string): Promise<void> {
    await this.db.query(`UPDATE users SET password = $2 WHERE username = $1`, [username, password]);
  }

  async updateProfileFromGoogle(
    username: string,
    input: { displayName: string }
  ): Promise<UserRecord | undefined> {
    await this.db.query(
      `UPDATE users
       SET display_name = CASE
             WHEN $2 <> '' THEN $2
             ELSE display_name
           END
       WHERE username = $1`,
      [username, input.displayName]
    );
    return this.findByUsername(username);
  }

  async listByRole(role: UserRole) {
    const result = await this.db.query<Pick<UserRow, "username" | "display_name" | "role" | "faculty_id" | "faculty_name">>(
      `SELECT u.username, u.display_name, u.role, u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id
       WHERE u.role = $1 AND u.status = 'active'
       ORDER BY u.username ASC`,
      [role]
    );
    return result.rows.map((row) => ({
      id: row.username,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      facultyId: row.faculty_id,
      facultyName: row.faculty_name
    }));
  }
}
