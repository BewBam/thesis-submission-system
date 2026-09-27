import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { Client } from "pg";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";

export const REVIEWER1 = {
  id: "reviewer1",
  username: "reviewer1",
  password: "review123"
};
export const LIBRARY1 = { username: "library1", password: "library123" };
export const DIRECTOR1 = { username: "director1", password: "director123" };
export const ADMIN1 = { username: "admin1", password: "admin123" };
export const TEST_COLLECTION_ID = "11111111-aaaa-4aaa-8aaa-111111111111";

const PERIOD = {
  universityId: "",
  facultyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01",
  semesterId: "cccccccc-cccc-4ccc-8ccc-cccccccccc01",
  periodId: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
  facultyName: "Automation Faculty",
  semesterName: "Automation Semester",
  periodName: "Automation Period"
};

export const pdfPath = path.join(__dirname, "fixtures", "thesis-valid.pdf");
export const pdfBuffer = readFileSync(pdfPath);

export function isRemote(): boolean {
  return Boolean(process.env.API_URL);
}

let app: INestApplication | null = null;
let server: unknown;

export async function initApi(): Promise<void> {
  if (isRemote()) {
    server = process.env.API_URL;
    return;
  }
  if (app) {
    return;
  }
  const { ValidationPipe } = await import("@nestjs/common");
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module");
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, "127.0.0.1");
  server = app.getHttpServer();
}

export async function closeApi(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
    server = undefined;
  }
}

export function http() {
  return request(server as never);
}

export function errorText(body: { message?: unknown; error?: unknown }): string {
  const message = body?.message;
  if (Array.isArray(message)) {
    return message.map(String).join(" ");
  }
  return String(message || body?.error || "");
}

export async function login(username: string, password: string) {
  const response = await http().post("/auth/login").send({ username, password });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Login ${username} failed ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return {
    token: response.body.access_token as string,
    user: response.body.user as { id: string; username: string; role: string }
  };
}

function pgConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.POSTGRES_USER || "thesis_user",
    password: process.env.POSTGRES_PASSWORD || "thesis_pass",
    database: process.env.POSTGRES_DB || "thesis_test"
  };
}

export async function ensureOpenPeriod(): Promise<typeof PERIOD> {
  if (isRemote()) {
    return ensureRemotePeriod();
  }
  const client = new Client(pgConfig());
  await client.connect();
  try {
    await client.query(
      `INSERT INTO faculties (id, name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [PERIOD.facultyId, PERIOD.facultyName]
    );
    await client.query(
      `INSERT INTO semesters (id, faculty_id, name, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [PERIOD.semesterId, PERIOD.facultyId, PERIOD.semesterName]
    );
    await client.query(
      `INSERT INTO submission_periods (
         id, semester_id, name, opens_at, closes_at, status, allow_resubmit
       ) VALUES (
         $1, $2, $3, NOW() - INTERVAL '1 day', NOW() + INTERVAL '365 days', 'open', TRUE
       )
       ON CONFLICT (id) DO NOTHING`,
      [PERIOD.periodId, PERIOD.semesterId, PERIOD.periodName]
    );
  } finally {
    await client.end();
  }
  return PERIOD;
}

async function ensureRemotePeriod(): Promise<typeof PERIOD> {
  const library = await login(LIBRARY1.username, LIBRARY1.password);
  const student = await login("student1", "student123");
  const faculties = await http()
    .get("/archive/faculties")
    .set("Authorization", `Bearer ${student.token}`);
  if (faculties.status === 200 && Array.isArray(faculties.body) && faculties.body.length > 0) {
    const faculty = faculties.body[0];
    const semesters = await http()
      .get(`/archive/faculties/${faculty.id}/semesters`)
      .set("Authorization", `Bearer ${student.token}`);
    const semester = semesters.body?.[0];
    if (semester) {
      const periods = await http()
        .get(`/archive/submission-periods?facultyId=${faculty.id}&semesterId=${semester.id}`)
        .set("Authorization", `Bearer ${student.token}`);
      const period = periods.body?.[0];
      if (period) {
        return {
          universityId: faculty.universityId,
          facultyId: faculty.id,
          semesterId: semester.id,
          periodId: period.id,
          facultyName: faculty.name,
          semesterName: semester.name,
          periodName: period.name
        };
      }
    }
  }

  const stamp = Date.now().toString(36);
  const faculty = await http()
    .post("/archive-config/faculties")
    .set("Authorization", `Bearer ${library.token}`)
    .send({
      name: `Automation Faculty ${stamp}`
    });
  if (faculty.status !== 201 && faculty.status !== 200) {
    throw new Error(`Create faculty failed ${faculty.status}: ${JSON.stringify(faculty.body)}`);
  }
  const semester = await http()
    .post(`/archive-config/faculties/${faculty.body.id}/semesters`)
    .set("Authorization", `Bearer ${library.token}`)
    .send({ name: `Automation Semester ${stamp}` });
  if (semester.status !== 201 && semester.status !== 200) {
    throw new Error(`Create semester failed ${semester.status}: ${JSON.stringify(semester.body)}`);
  }
  const period = await http()
    .post(`/archive-config/faculties/${faculty.body.id}/submission-periods`)
    .set("Authorization", `Bearer ${library.token}`)
    .send({
      semesterId: semester.body.id,
      name: `Automation Period ${stamp}`,
      opensAt: new Date(Date.now() - 86400000).toISOString(),
      closesAt: new Date(Date.now() + 86400000 * 365).toISOString()
    });
  if (period.status !== 201 && period.status !== 200) {
    throw new Error(`Create period failed ${period.status}: ${JSON.stringify(period.body)}`);
  }
  const opened = await http()
    .post(`/archive-config/submission-periods/${period.body.id}/open`)
    .set("Authorization", `Bearer ${library.token}`);
  if (opened.status !== 201 && opened.status !== 200) {
    throw new Error(`Open period failed ${opened.status}: ${JSON.stringify(opened.body)}`);
  }
  return {
    universityId: "",
    facultyId: faculty.body.id,
    semesterId: semester.body.id,
    periodId: period.body.id,
    facultyName: faculty.body.name,
    semesterName: semester.body.name,
    periodName: period.body.name
  };
}

export type TestUser = { id: string; username: string; password: string; token: string };

export async function createUser(
  role: "student" | "reviewer" | "library_staff" | "director",
  adminToken?: string
): Promise<TestUser> {
  const username = `t${role.slice(0, 3)}${randomUUID().slice(0, 8)}`;
  const password = "testpass1";
  const displayName = `Test ${role} ${username}`;
  const needsFaculty = role === "student" || role === "reviewer";
  if (!isRemote()) {
    const client = new Client(pgConfig());
    await client.connect();
    try {
      await client.query(
        `INSERT INTO users (username, password, display_name, role, status, faculty_id)
         VALUES ($1, $2, $3, $4, 'active', $5)`,
        [username, password, displayName, role, needsFaculty ? PERIOD.facultyId : null]
      );
    } finally {
      await client.end();
    }
    const session = await login(username, password);
    return { id: username, username, password, token: session.token };
  }
  const token = adminToken || (await login(ADMIN1.username, ADMIN1.password)).token;
  let facultyId: string | undefined;
  if (needsFaculty) {
    const faculties = await http()
      .get("/archive-config/faculties")
      .set("Authorization", `Bearer ${token}`);
    facultyId = faculties.body?.[0]?.id as string | undefined;
    if (!facultyId) {
      throw new Error("Remote portal has no faculty for test users");
    }
  }
  const created = await http()
    .post("/admin/users")
    .set("Authorization", `Bearer ${token}`)
    .send({ username, password, displayName, role, ...(facultyId ? { facultyId } : {}) });
  if (created.status !== 201 && created.status !== 200) {
    throw new Error(`Create user failed ${created.status}: ${JSON.stringify(created.body)}`);
  }
  const session = await login(username, password);
  return { id: created.body.id as string, username, password, token: session.token };
}

export function thesisFields(
  periodId: string,
  studentId: string,
  reviewerIds: string[],
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    titleVi: extra.titleVi || "Tieu de tieng Viet",
    titleEn: extra.titleEn || `English title ${randomUUID().slice(0, 8)}`,
    thesisAdvisors: "Advisor A",
    major: "Computer Science",
    thesisYear: "2026",
    dateIssued: "2026",
    publisher: "Ho Chi Minh City University of Technology",
    documentType: "Thesis",
    language: "vie",
    abstract: "Automation abstract",
    description: "Automation description",
    studentId,
    submissionPeriodId: periodId,
    authorIds: JSON.stringify(extra.authorIds ? JSON.parse(extra.authorIds) : [studentId]),
    reviewerIds: JSON.stringify(reviewerIds),
    ...stripIds(extra)
  };
}

function stripIds(extra: Record<string, string>): Record<string, string> {
  const copy = { ...extra };
  delete copy.authorIds;
  return copy;
}

export async function postMultipart(
  urlPath: string,
  token: string | undefined,
  fields: Record<string, string>,
  file?: { buffer: Buffer; filename: string; contentType?: string }
) {
  let req = http().post(urlPath);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      req = req.field(key, value);
    }
  }
  if (file) {
    req = req.attach("thesisFile", file.buffer, {
      filename: file.filename,
      contentType: file.contentType || "application/pdf"
    });
  }
  return req;
}

export async function submitThesis(
  token: string,
  periodId: string,
  studentId: string,
  reviewerIds: string[],
  options: {
    fields?: Record<string, string>;
    file?: { buffer: Buffer; filename: string; contentType?: string } | null;
    omit?: string[];
  } = {}
) {
  const fields = thesisFields(periodId, studentId, reviewerIds, options.fields);
  for (const key of options.omit || []) {
    delete fields[key];
  }
  const file =
    options.file === null
      ? undefined
      : options.file || { buffer: pdfBuffer, filename: "thesis-valid.pdf", contentType: "application/pdf" };
  return postMultipart("/submissions", token, fields, file);
}

export async function studentSubmissions(token: string, studentId: string) {
  return http().get(`/submissions/student/${studentId}`).set("Authorization", `Bearer ${token}`);
}

export async function deleteSubmission(token: string, submissionId: string) {
  return http().delete(`/submissions/${submissionId}`).set("Authorization", `Bearer ${token}`);
}
