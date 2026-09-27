import { expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

export const pdfPath = path.join(__dirname, "..", "backend", "test", "fixtures", "thesis-valid.pdf");

export function apiBase(): string {
  if (process.env.API_URL) {
    return process.env.API_URL.replace(/\/$/, "");
  }
  if (process.env.PORTAL_URL) {
    throw new Error("Set API_URL when PORTAL_URL is set.");
  }
  return "http://127.0.0.1:3001";
}

type Session = { token: string; user: { id: string; username: string; role: string } };

export async function apiLogin(username: string, password: string): Promise<Session> {
  const response = await fetch(`${apiBase()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Login ${username} failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return { token: body.access_token, user: body.user };
}

export async function createStudent(): Promise<Session & { password: string }> {
  const admin = await apiLogin("admin1", "admin123");
  const username = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const password = "testpass1";
  const created = await fetch(`${apiBase()}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({
      username,
      password,
      displayName: `E2E ${username}`,
      role: "student"
    })
  });
  const body = await created.json();
  if (!created.ok) {
    throw new Error(`Create student failed ${created.status}: ${JSON.stringify(body)}`);
  }
  const session = await apiLogin(username, password);
  return { ...session, password };
}

export async function deleteSubmission(id: string) {
  const library = await apiLogin("library1", "library123");
  await fetch(`${apiBase()}/submissions/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${library.token}` }
  });
}

async function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function ensureOpenPeriod() {
  const student = await apiLogin("student1", "student123");
  const facultiesResponse = await fetch(`${apiBase()}/archive/faculties`, {
    headers: await authHeaders(student.token)
  });
  const faculties = await facultiesResponse.json();
  const preferred = Array.isArray(faculties)
    ? faculties.find((item: { name: string }) => item.name === "Automation Faculty") || faculties[0]
    : null;
  if (preferred) {
    const semesters = await (
      await fetch(`${apiBase()}/archive/faculties/${preferred.id}/semesters`, {
        headers: await authHeaders(student.token)
      })
    ).json();
    const semester =
      semesters.find((item: { name: string }) => item.name === "Automation Semester") || semesters[0];
    if (semester) {
      const periods = await (
        await fetch(
          `${apiBase()}/archive/submission-periods?facultyId=${preferred.id}&semesterId=${semester.id}`,
          { headers: await authHeaders(student.token) }
        )
      ).json();
      const period = periods.find((item: { name: string }) => item.name === "Automation Period") || periods[0];
      if (period) {
        return {
          facultyName: preferred.name as string,
          semesterName: semester.name as string,
          periodName: period.name as string
        };
      }
    }
  }
  throw new Error("No open submission period. Local setup should seed Automation Period.");
}

export async function submitViaApi(student: Session, titleEn: string) {
  const period = await openPeriodIds();
  const form = new FormData();
  form.set("titleVi", "Tieu de e2e");
  form.set("titleEn", titleEn);
  form.set("thesisAdvisors", "Advisor A");
  form.set("major", "Computer Science");
  form.set("thesisYear", "2026");
  form.set("dateIssued", "2026");
  form.set("publisher", "Ho Chi Minh City University of Technology");
  form.set("documentType", "Thesis");
  form.set("language", "vie");
  form.set("abstract", "E2E abstract");
  form.set("description", "E2E description");
  form.set("studentId", student.user.id);
  form.set("submissionPeriodId", period.periodId);
  form.set("authorIds", JSON.stringify([student.user.id]));
  const reviewer = await apiLogin("reviewer1", "review123");
  form.set("reviewerIds", JSON.stringify([reviewer.user.id]));
  const bytes = readFileSync(pdfPath);
  form.set("thesisFile", new Blob([bytes], { type: "application/pdf" }), "thesis-valid.pdf");
  const response = await fetch(`${apiBase()}/submissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${student.token}` },
    body: form
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`API submit failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body as { id: string; status: string };
}

async function openPeriodIds() {
  const student = await apiLogin("student1", "student123");
  const faculties = await (
    await fetch(`${apiBase()}/archive/faculties`, { headers: { Authorization: `Bearer ${student.token}` } })
  ).json();
  const faculty = faculties.find((item: { name: string }) => item.name === "Automation Faculty") || faculties[0];
  const semesters = await (
    await fetch(`${apiBase()}/archive/faculties/${faculty.id}/semesters`, {
      headers: { Authorization: `Bearer ${student.token}` }
    })
  ).json();
  const semester = semesters.find((item: { name: string }) => item.name === "Automation Semester") || semesters[0];
  const periods = await (
    await fetch(`${apiBase()}/archive/submission-periods?facultyId=${faculty.id}&semesterId=${semester.id}`, {
      headers: { Authorization: `Bearer ${student.token}` }
    })
  ).json();
  const period = periods.find((item: { name: string }) => item.name === "Automation Period") || periods[0];
  return { periodId: period.id as string };
}

export async function loginUi(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

export async function logoutUi(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
}

export async function chooseOption(page: Page, label: string, optionText: string) {
  const field = page.locator(".ant-form-item").filter({ has: page.locator("label", { hasText: label }) });
  await field.locator(".ant-select").click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
  await dropdown.locator(".ant-select-item-option", { hasText: optionText }).first().click();
}

export async function fillThesisForm(page: Page, titleEn: string, options: { pdf?: boolean } = { pdf: true }) {
  const period = await ensureOpenPeriod();
  await chooseOption(page, "Faculty", period.facultyName);
  await chooseOption(page, "Semester", period.semesterName);
  await chooseOption(page, "Submission period", period.periodName);
  await page.getByLabel("Thesis title (Vietnamese)").fill("Tieu de e2e");
  await page.getByLabel("Thesis title (English)").fill(titleEn);
  await page.getByLabel("Advisor(s)").fill("Advisor A");
  await page.getByLabel("Major").fill("Computer Science");
  await chooseOption(page, "Reviewers", "Reviewer One");
  await page.getByLabel("Abstract").fill("E2E abstract");
  await page.getByLabel("Description").fill("E2E description");
  if (options.pdf) {
    await page.locator("input[type=file]").setInputFiles(pdfPath);
  }
}
