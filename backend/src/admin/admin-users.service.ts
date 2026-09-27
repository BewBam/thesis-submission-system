import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { createPgPool } from "../users/db-pool";
import { isUserRole, USER_ROLES, type UserRole } from "../users/user-role";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

type UserAdminRow = {
  username: string;
  display_name: string;
  role: UserRole;
  status: string;
  created_at: Date;
  faculty_id: string | null;
  faculty_name: string | null;
};

function roleNeedsFaculty(role: UserRole) {
  return role === "student" || role === "reviewer";
}

@Injectable()
export class AdminUsersService {
  private readonly db = createPgPool();

  async listAll() {
    const result = await this.db.query<UserAdminRow>(
      `SELECT u.username, u.display_name, u.role, u.status, u.created_at,
              u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id
       ORDER BY u.username ASC`
    );
    return result.rows.map((row) => this.mapAdminUser(row));
  }

  async create(dto: CreateUserDto) {
    const existing = await this.db.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1`, [
      dto.username.trim()
    ]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new BadRequestException("Username already exists");
    }

    const facultyId = await this.resolveFacultyId(dto.facultyId, dto.role);
    const username = dto.username.trim();
    await this.db.query(
      `INSERT INTO users (username, password, display_name, role, status, faculty_id)
       VALUES ($1, $2, $3, $4, 'active', $5)`,
      [username, dto.password, dto.displayName.trim(), dto.role, facultyId]
    );

    const created = await this.db.query<UserAdminRow>(
      `SELECT u.username, u.display_name, u.role, u.status, u.created_at,
              u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id
       WHERE u.username = $1`,
      [username]
    );
    return this.mapAdminUser(created.rows[0]);
  }

  async update(actorId: string, userId: string, dto: UpdateUserDto) {
    const current = await this.db.query<UserAdminRow>(
      `SELECT u.username, u.display_name, u.role, u.status, u.created_at,
              u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id
       WHERE u.username = $1
       LIMIT 1`,
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

    const nextRole = dto.role ?? row.role;
    const nextFacultyId =
      dto.facultyId !== undefined ? dto.facultyId || null : row.faculty_id;
    const facultyId = await this.resolveFacultyId(nextFacultyId, nextRole);

    await this.db.query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           role = COALESCE($3, role),
           password = COALESCE($4, password),
           status = COALESCE($5, status),
           faculty_id = $6
       WHERE username = $1`,
      [
        userId,
        dto.displayName?.trim() ?? null,
        dto.role ?? null,
        dto.password ?? null,
        dto.status ?? null,
        facultyId
      ]
    );

    const updated = await this.db.query<UserAdminRow>(
      `SELECT u.username, u.display_name, u.role, u.status, u.created_at,
              u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id
       WHERE u.username = $1`,
      [userId]
    );
    return this.mapAdminUser(updated.rows[0]);
  }

  async remove(actorId: string, userId: string) {
    if (userId === actorId) {
      throw new BadRequestException("You cannot delete your own account");
    }
    const current = await this.db.query<UserAdminRow>(
      `SELECT u.username, u.display_name, u.role, u.status, u.created_at,
              u.faculty_id, f.name AS faculty_name
       FROM users u
       LEFT JOIN faculties f ON f.id = u.faculty_id
       WHERE u.username = $1
       LIMIT 1`,
      [userId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new NotFoundException("User not found");
    }
    if (row.role === "admin") {
      const remainingAdmins = await this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin' AND status = 'active' AND username <> $1`,
        [userId]
      );
      if (Number(remainingAdmins.rows[0]?.count || 0) < 1) {
        throw new BadRequestException("Cannot delete the last active administrator");
      }
    }
    const submissionOwner = await this.db.query(`SELECT 1 FROM submissions WHERE student_id = $1 LIMIT 1`, [
      userId
    ]);
    if (submissionOwner.rowCount && submissionOwner.rowCount > 0) {
      throw new BadRequestException(
        "This user has thesis submissions. Disable the account instead of deleting it."
      );
    }
    const reviewerRows = await this.db.query(`SELECT 1 FROM reviews WHERE reviewer_id = $1 LIMIT 1`, [userId]);
    if (reviewerRows.rowCount && reviewerRows.rowCount > 0) {
      throw new BadRequestException(
        "This user has review records. Disable the account instead of deleting it."
      );
    }

    await this.db.query(`DELETE FROM users WHERE username = $1`, [userId]);
    return { deleted: true, id: userId, username: row.username };
  }

  async buildImportTemplate(): Promise<Buffer> {
    const faculties = await this.db.query<{ name: string }>(
      `SELECT name FROM faculties WHERE status = 'active' ORDER BY name ASC`
    );
    const sampleFaculty = faculties.rows[0]?.name || "Khoa Khoa học và Kỹ thuật Máy tính";
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("users");
    sheet.columns = [
      { header: "username", key: "username", width: 24 },
      { header: "display name", key: "displayName", width: 28 },
      { header: "role", key: "role", width: 16 },
      { header: "faculty", key: "faculty", width: 42 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRows([
      { username: "nguyen.vana", displayName: "Nguyen Van A", role: "student", faculty: sampleFaculty },
      { username: "tran.thib", displayName: "Tran Thi B", role: "reviewer", faculty: sampleFaculty },
      { username: "library.staff1", displayName: "Library Staff One", role: "library_staff", faculty: "" },
      { username: "director.one", displayName: "Library Director", role: "director", faculty: "" },
      { username: "admin.one", displayName: "Administrator", role: "admin", faculty: "" }
    ]);
    const note = workbook.addWorksheet("roles");
    note.addRow(["Allowed role values"]);
    note.addRow([...USER_ROLES]);
    note.getRow(1).font = { bold: true };
    const facultySheet = workbook.addWorksheet("faculties");
    facultySheet.addRow(["Faculty name (required for student and reviewer)"]);
    facultySheet.getRow(1).font = { bold: true };
    for (const faculty of faculties.rows) {
      facultySheet.addRow([faculty.name]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async buildUsersExport(): Promise<Buffer> {
    const rows = await this.listAll();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("users");
    sheet.columns = [
      { header: "username", key: "username", width: 24 },
      { header: "display name", key: "displayName", width: 28 },
      { header: "role", key: "role", width: 16 },
      { header: "faculty", key: "faculty", width: 42 },
      { header: "status", key: "status", width: 14 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(
      rows.map((row) => ({
        username: row.username,
        displayName: row.displayName,
        role: row.role,
        faculty: row.facultyName || "",
        status: row.status
      }))
    );
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async previewFromExcel(fileBuffer: Buffer) {
    return this.parseExcelRows(fileBuffer);
  }

  async confirmImport(
    rows: Array<{ username: string; displayName: string; role: UserRole; facultyId?: string | null }>
  ) {
    const created: { username: string; displayName: string; role: UserRole; facultyName: string | null }[] = [];
    const errors: { row?: number; username?: string; message: string }[] = [];
    const seen = new Set<string>();

    for (const raw of rows) {
      const username = raw.username.trim();
      const displayName = raw.displayName.trim();
      const role = raw.role;
      const usernameKey = username.toLowerCase();
      if (seen.has(usernameKey)) {
        errors.push({ username, message: "Duplicate username in import list" });
        continue;
      }
      seen.add(usernameKey);

      const existing = await this.db.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1`, [
        username
      ]);
      if (existing.rowCount && existing.rowCount > 0) {
        errors.push({ username, message: "Username already exists" });
        continue;
      }

      const faculty = await this.resolveFacultyByNameOrId(raw.facultyId, role);
      if (faculty.error) {
        errors.push({ username, message: faculty.error });
        continue;
      }

      const inserted = await this.insertImportedUser(username, displayName, role, faculty.id);
      if ("error" in inserted) {
        errors.push({ username, message: inserted.error });
      } else {
        created.push(inserted);
      }
    }

    return {
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors
    };
  }

  private async parseExcelRows(fileBuffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("The Excel file has no worksheets");
    }

    const headerRow = sheet.getRow(1);
    const colIndex: { username?: number; displayName?: number; role?: number; faculty?: number } = {};
    headerRow.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
      const key = normalizeImportHeader(cellText(cell.value));
      if (key === "username") colIndex.username = colNumber;
      if (key === "display name" || key === "displayname" || key === "display_name") {
        colIndex.displayName = colNumber;
      }
      if (key === "role") colIndex.role = colNumber;
      if (key === "faculty" || key === "faculty name" || key === "khoa") colIndex.faculty = colNumber;
    });
    if (!colIndex.username || !colIndex.displayName || !colIndex.role || !colIndex.faculty) {
      throw new BadRequestException("Template columns required: username, display name, role, faculty");
    }

    const toImport: {
      row: number;
      username: string;
      displayName: string;
      role: UserRole;
      facultyId: string | null;
      facultyName: string | null;
    }[] = [];
    const errors: { row: number; username?: string; message: string }[] = [];
    const seen = new Set<string>();

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const username = cellText(row.getCell(colIndex.username).value).trim();
      const displayName = cellText(row.getCell(colIndex.displayName).value).trim();
      const roleRaw = cellText(row.getCell(colIndex.role).value).trim().toLowerCase();
      const facultyName = cellText(row.getCell(colIndex.faculty).value).trim();
      if (!username && !displayName && !roleRaw && !facultyName) {
        continue;
      }
      if (username.length < 2) {
        errors.push({ row: rowNumber, username, message: "Username must be at least 2 characters" });
        continue;
      }
      if (!displayName) {
        errors.push({ row: rowNumber, username, message: "Display name is required" });
        continue;
      }
      if (!isUserRole(roleRaw)) {
        errors.push({
          row: rowNumber,
          username,
          message: `Invalid role "${roleRaw || ""}". Use: ${USER_ROLES.join(", ")}`
        });
        continue;
      }
      const usernameKey = username.toLowerCase();
      if (seen.has(usernameKey)) {
        errors.push({ row: rowNumber, username, message: "Duplicate username in file" });
        continue;
      }
      seen.add(usernameKey);

      const existing = await this.db.query(`SELECT 1 FROM users WHERE lower(username) = lower($1) LIMIT 1`, [
        username
      ]);
      if (existing.rowCount && existing.rowCount > 0) {
        errors.push({ row: rowNumber, username, message: "Username already exists" });
        continue;
      }

      const faculty = await this.resolveFacultyName(facultyName, roleRaw);
      if (faculty.error) {
        errors.push({ row: rowNumber, username, message: faculty.error });
        continue;
      }

      toImport.push({
        row: rowNumber,
        username,
        displayName,
        role: roleRaw,
        facultyId: faculty.id,
        facultyName: faculty.name
      });
    }

    return {
      toImportCount: toImport.length,
      errorCount: errors.length,
      toImport,
      errors
    };
  }

  private async insertImportedUser(
    username: string,
    displayName: string,
    role: UserRole,
    facultyId: string | null
  ): Promise<{ username: string; displayName: string; role: UserRole; facultyName: string | null } | { error: string }> {
    try {
      await this.db.query(
        `INSERT INTO users (username, password, display_name, role, status, auth_source, faculty_id)
         VALUES ($1, NULL, $2, $3, 'active', 'google', $4)`,
        [username, displayName, role, facultyId]
      );
      const faculty = facultyId
        ? await this.db.query<{ name: string }>(`SELECT name FROM faculties WHERE id = $1::uuid LIMIT 1`, [facultyId])
        : { rows: [] as { name: string }[] };
      return { username, displayName, role, facultyName: faculty.rows[0]?.name ?? null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to create user" };
    }
  }

  private mapAdminUser(row: UserAdminRow) {
    return {
      id: row.username,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      facultyId: row.faculty_id,
      facultyName: row.faculty_name,
      createdAt: row.created_at
    };
  }

  private async resolveFacultyId(facultyId: string | null | undefined, role: UserRole): Promise<string | null> {
    if (!facultyId) {
      if (roleNeedsFaculty(role)) {
        throw new BadRequestException("Student and reviewer accounts must belong to a faculty");
      }
      return null;
    }
    const found = await this.db.query(
      `SELECT 1 FROM faculties WHERE id = $1::uuid AND status = 'active' LIMIT 1`,
      [facultyId]
    );
    if (!found.rows[0]) {
      throw new BadRequestException("Faculty not found");
    }
    return facultyId;
  }

  private async resolveFacultyName(name: string, role: UserRole): Promise<{ id: string | null; name: string | null; error?: string }> {
    const trimmed = name.trim();
    if (!trimmed) {
      if (roleNeedsFaculty(role)) {
        return { id: null, name: null, error: "Faculty is required for student and reviewer" };
      }
      return { id: null, name: null };
    }
    const found = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM faculties WHERE lower(name) = lower($1) AND status = 'active'`,
      [trimmed]
    );
    if (found.rows.length !== 1) {
      return { id: null, name: null, error: `Unknown faculty "${trimmed}"` };
    }
    return { id: found.rows[0].id, name: found.rows[0].name };
  }

  private async resolveFacultyByNameOrId(
    facultyId: string | null | undefined,
    role: UserRole
  ): Promise<{ id: string | null; error?: string }> {
    try {
      const id = await this.resolveFacultyId(facultyId, role);
      return { id };
    } catch (error) {
      return { id: null, error: error instanceof Error ? error.message : "Invalid faculty" };
    }
  }
}

function normalizeImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function cellText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "text" in value && typeof (value as { text: unknown }).text === "string") {
    return (value as { text: string }).text;
  }
  if (typeof value === "object" && "richText" in value && Array.isArray((value as { richText: unknown }).richText)) {
    return (value as { richText: Array<{ text?: string }> }).richText.map((part) => part.text ?? "").join("");
  }
  return String(value);
}
