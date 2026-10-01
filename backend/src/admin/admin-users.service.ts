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

const MAX_IMPORT_ROWS = 5000;

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

  async previewImport(fileBuffer: Buffer, originalName = "") {
    const matrix = /\.csv$/i.test(originalName)
      ? parseCsvMatrix(fileBuffer)
      : await this.excelMatrix(fileBuffer);
    return this.previewMatrix(matrix);
  }

  async confirmImport(
    rows: Array<{
      username: string;
      displayName: string;
      role: UserRole;
      facultyId?: string | null;
      password?: string | null;
      status?: "active" | "disabled";
    }>
  ) {
    const created: { username: string; displayName: string; role: UserRole; facultyName: string | null }[] = [];
    const errors: { row?: number; username?: string; message: string }[] = [];
    const seen = new Set<string>();

    for (const raw of rows) {
      const username = raw.username.trim();
      const displayName = raw.displayName.trim();
      const role = raw.role;
      const password = raw.password?.trim() ? raw.password.trim() : null;
      const status = raw.status === "disabled" ? "disabled" : "active";
      const usernameKey = username.toLowerCase();
      if (seen.has(usernameKey)) {
        errors.push({ username, message: "Duplicate username in import list" });
        continue;
      }
      seen.add(usernameKey);

      if (password && password.length < 6) {
        errors.push({ username, message: "Password must be at least 6 characters" });
        continue;
      }

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

      const inserted = await this.insertImportedUser(username, displayName, role, faculty.id, password, status);
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

  private async excelMatrix(fileBuffer: Buffer): Promise<string[][]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("The Excel file has no worksheets");
    }

    const matrix: string[][] = [];
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const width = Math.max(sheet.columnCount, row.cellCount);
      const cells: string[] = [];
      for (let col = 1; col <= width; col += 1) {
        cells.push(cellText(row.getCell(col).value).trim());
      }
      matrix.push(cells);
    }
    return matrix;
  }

  private async previewMatrix(matrix: string[][]) {
    const headerIndex = matrix.findIndex((row) => row.some((cell) => cell.trim() !== ""));
    if (headerIndex < 0) {
      throw new BadRequestException("The file has no header row");
    }

    const columns = mapImportColumns(matrix[headerIndex]);
    if (!hasImportIdentityColumns(columns)) {
      throw new BadRequestException(
        "Unrecognized columns. Use username, display name, role, faculty — or email, netid, last_name, first_name, phone, language, can_log_in, password."
      );
    }

    const toImport: {
      row: number;
      username: string;
      displayName: string;
      email: string | null;
      role: UserRole;
      status: "active" | "disabled";
      password: string | null;
      facultyId: string | null;
      facultyName: string | null;
    }[] = [];
    const errors: { row: number; username?: string; message: string }[] = [];
    const seen = new Set<string>();
    let dataRows = 0;

    for (let index = headerIndex + 1; index < matrix.length; index += 1) {
      const cells = matrix[index];
      const rowNumber = index + 1;
      const email = cellAt(cells, columns.email);
      const username = firstNonEmpty(
        cellAt(cells, columns.username),
        cellAt(cells, columns.netid),
        emailLocalPart(email)
      );
      const displayName = buildDisplayName(
        cellAt(cells, columns.displayName),
        cellAt(cells, columns.lastName),
        cellAt(cells, columns.firstName),
        email
      );
      const roleRaw = cellAt(cells, columns.role).toLowerCase();
      const facultyName = cellAt(cells, columns.faculty);
      const passwordRaw = cellAt(cells, columns.password);
      const canLogInRaw = columns.canLogIn == null ? "" : cellAt(cells, columns.canLogIn);
      if (!username && !displayName && !roleRaw && !facultyName && !email && !passwordRaw && !canLogInRaw) {
        continue;
      }

      dataRows += 1;
      if (dataRows > MAX_IMPORT_ROWS) {
        throw new BadRequestException(`Import is limited to ${MAX_IMPORT_ROWS} users`);
      }
      if (username.length < 2) {
        errors.push({ row: rowNumber, username, message: "Username must be at least 2 characters" });
        continue;
      }
      if (!displayName) {
        errors.push({ row: rowNumber, username, message: "Display name is required" });
        continue;
      }

      let role: UserRole;
      if (columns.role == null) {
        role = "student";
      } else if (!isUserRole(roleRaw)) {
        errors.push({
          row: rowNumber,
          username,
          message: `Invalid role "${roleRaw}". Use: ${USER_ROLES.join(", ")}`
        });
        continue;
      } else {
        role = roleRaw;
      }

      let password: string | null = null;
      if (passwordRaw) {
        if (passwordRaw.length < 6) {
          errors.push({ row: rowNumber, username, message: "Password must be at least 6 characters" });
          continue;
        }
        password = passwordRaw;
      }

      let status: "active" | "disabled" = "active";
      if (canLogInRaw) {
        const parsed = parseCanLogIn(canLogInRaw);
        if (!parsed) {
          errors.push({
            row: rowNumber,
            username,
            message: `Invalid can_log_in "${canLogInRaw}". Use true or false.`
          });
          continue;
        }
        status = parsed;
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

      let facultyId: string | null = null;
      let resolvedFacultyName: string | null = null;
      if (facultyName) {
        const faculty = await this.resolveFacultyName(facultyName, role);
        if (faculty.error) {
          errors.push({ row: rowNumber, username, message: faculty.error });
          continue;
        }
        facultyId = faculty.id;
        resolvedFacultyName = faculty.name;
      }

      toImport.push({
        row: rowNumber,
        username,
        displayName,
        email: email || null,
        role,
        status,
        password,
        facultyId,
        facultyName: resolvedFacultyName
      });
    }

    return {
      toImportCount: toImport.length,
      errorCount: errors.length,
      requiresFaculty: toImport.some((row) => roleNeedsFaculty(row.role) && !row.facultyId),
      toImport,
      errors
    };
  }

  private async insertImportedUser(
    username: string,
    displayName: string,
    role: UserRole,
    facultyId: string | null,
    password: string | null,
    status: "active" | "disabled"
  ): Promise<{ username: string; displayName: string; role: UserRole; facultyName: string | null } | { error: string }> {
    try {
      await this.db.query(
        `INSERT INTO users (username, password, display_name, role, status, auth_source, faculty_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [username, password, displayName, role, status, password ? "local" : "google", facultyId]
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

type ImportColumns = {
  username?: number;
  netid?: number;
  email?: number;
  displayName?: number;
  firstName?: number;
  lastName?: number;
  role?: number;
  faculty?: number;
  password?: number;
  canLogIn?: number;
};

function mapImportColumns(headers: string[]): ImportColumns {
  const columns: ImportColumns = {};
  headers.forEach((header, index) => {
    const key = normalizeImportHeader(header);
    if (key === "username" || key === "user name") columns.username = index;
    else if (key === "netid" || key === "net id" || key === "student id" || key === "mssv") columns.netid = index;
    else if (key === "email" || key === "e mail") columns.email = index;
    else if (key === "display name" || key === "displayname" || key === "full name" || key === "name") {
      columns.displayName = index;
    } else if (key === "first name" || key === "firstname" || key === "given name") columns.firstName = index;
    else if (key === "last name" || key === "lastname" || key === "surname" || key === "family name") {
      columns.lastName = index;
    } else if (key === "role") columns.role = index;
    else if (key === "faculty" || key === "faculty name" || key === "khoa") columns.faculty = index;
    else if (key === "password") columns.password = index;
    else if (key === "can log in" || key === "canlogin") columns.canLogIn = index;
  });
  return columns;
}

function hasImportIdentityColumns(columns: ImportColumns) {
  const hasUser = columns.username != null || columns.netid != null || columns.email != null;
  const hasName = columns.displayName != null || columns.firstName != null || columns.lastName != null;
  return hasUser && hasName;
}

function cellAt(cells: string[], index: number | undefined) {
  if (index == null) return "";
  return (cells[index] ?? "").trim();
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value.trim())?.trim() ?? "";
}

function emailLocalPart(email: string) {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "";
  return trimmed.slice(0, at).trim();
}

function buildDisplayName(displayName: string, lastName: string, firstName: string, email: string) {
  if (displayName.trim()) return displayName.trim();
  const combined = [lastName.trim(), firstName.trim()].filter(Boolean).join(" ");
  if (combined) return combined;
  return email.trim();
}

function parseCanLogIn(value: string): "active" | "disabled" | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return "active";
  if (["false", "no", "n", "0"].includes(normalized)) return "disabled";
  return null;
}

function parseCsvMatrix(fileBuffer: Buffer): string[][] {
  let text = fileBuffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\r") continue;
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
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
