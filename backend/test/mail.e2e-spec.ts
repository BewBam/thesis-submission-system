import { Client } from "pg";
import {
  DIRECTOR1,
  LIBRARY1,
  REVIEWER1,
  closeApi,
  createUser,
  deleteSubmission,
  ensureOpenPeriod,
  http,
  initApi,
  isRemote,
  login,
  studentSubmissions,
  submitThesis
} from "./helpers";

const MAILPIT = "http://127.0.0.1:8025";

type MailSummary = {
  ID: string;
  Subject: string;
  To?: Array<{ Address?: string }>;
  Text?: string;
};

const describeMail = isRemote() ? describe.skip : describe;

describeMail("Email integration (Mailpit, local only)", () => {
  let periodId = "";
  let libraryToken = "";
  let directorToken = "";
  let reviewerToken = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    await assertMailpit();
    await initApi();
    periodId = (await ensureOpenPeriod()).periodId;
    libraryToken = (await login(LIBRARY1.username, LIBRARY1.password)).token;
    directorToken = (await login(DIRECTOR1.username, DIRECTOR1.password)).token;
    reviewerToken = (await login(REVIEWER1.username, REVIEWER1.password)).token;
    await setMailSettings({
      email_enabled: "true",
      smtp_host: "127.0.0.1",
      smtp_port: "1025",
      smtp_secure: "false",
      smtp_user: "",
      smtp_password: "",
      smtp_from: "Thesis Portal <noreply@localhost>"
    });
  });

  afterAll(async () => {
    await setMailSettings({
      email_enabled: "false",
      smtp_host: "",
      smtp_port: "587",
      smtp_secure: "false",
      smtp_user: "",
      smtp_password: "",
      smtp_from: ""
    });
    for (const id of createdIds) {
      await deleteSubmission(libraryToken, id);
    }
    await closeApi();
  });

  beforeEach(async () => {
    await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  });

  async function freshSubmission(reviewerIds = [REVIEWER1.id], titleEn?: string) {
    const student = await createUser("student");
    const title = titleEn || `Mail thesis ${student.username}`;
    const response = await submitThesis(student.token, periodId, student.id, reviewerIds, {
      fields: { titleEn: title }
    });
    expect(response.status).toBe(201);
    createdIds.push(response.body.id);
    return { student, id: response.body.id as string, title, email: `${student.username}@hcmut.edu.vn` };
  }

  it("TC-MAIL-001 emails the assigned reviewer and the student on submit", async () => {
    const { title, email } = await freshSubmission();
    const toReviewer = await waitForMail(title, "reviewer1@hcmut.edu.vn");
    const toStudent = await waitForMail(title, email);
    expect(toReviewer.Text || "").toContain(title);
    expect(toStudent.Text || "").toContain(title);
  });

  it("TC-MAIL-002 includes the reject reason in the student email", async () => {
    const { id, title, email } = await freshSubmission();
    await waitForMail(title, email);
    await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
    const reason = "Abstract is too short";
    const rejected = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "reject", comment: reason });
    expect(rejected.status).toBe(201);
    const mail = await waitForMail(title, email);
    expect(mail.Text || "").toContain(reason);
  });

  it("TC-MAIL-003 emails library only after every reviewer approves", async () => {
    const second = await createUser("reviewer");
    const { id, title, email } = await freshSubmission([REVIEWER1.id, second.id]);
    await waitForMail(title, email);
    await clearMailbox();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    await waitForMail(title, email);
    expect(await messagesTo("library1@hcmut.edu.vn", title)).toHaveLength(0);

    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${second.token}`)
      .send({ submissionId: id, action: "approve" });
    const mail = await waitForMail(title, "library1@hcmut.edu.vn");
    expect(mail.Subject.length).toBeGreaterThan(0);
  });

  it("TC-MAIL-004 emails the director after library approval", async () => {
    const { id, title } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    const approved = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    expect(approved.status).toBe(201);
    const mail = await waitForMail(title, "director1@hcmut.edu.vn");
    expect(mail.Subject.length).toBeGreaterThan(0);
  });

  it("TC-MAIL-005 includes the library reject reason in the student email", async () => {
    const { student, id, title, email } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    await waitForMail(title, email);
    await clearMailbox();
    const reason = "PDF metadata is incomplete";
    const rejected = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "reject", comment: reason });
    expect(rejected.status).toBe(201);
    const mail = await waitForMail(title, email);
    expect(mail.Text || "").toContain(reason);
    const list = await studentSubmissions(student.token, student.id);
    expect(list.body.find((item: { id: string }) => item.id === id).status).toBe("rejected");
  });

  it("TC-MAIL-006 emails the student when the director archives", async () => {
    const { student, id, title, email } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    await waitForMail(title, "director1@hcmut.edu.vn");
    await clearMailbox();
    const archived = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${directorToken}`)
      .send({ submissionId: id, action: "archive" });
    expect(archived.status).toBe(201);
    const mail = await waitForMail(title, email);
    expect(mail.Text || "").toContain("lưu trữ");
    const list = await studentSubmissions(student.token, student.id);
    expect(list.body.find((item: { id: string }) => item.id === id).status).toBe("archived");
  });

  it("TC-MAIL-007 still accepts a submission when SMTP is unreachable", async () => {
    await setMailSettings({ smtp_host: "127.0.0.1", smtp_port: "1", smtp_from: "Thesis Portal <noreply@localhost>" });
    try {
      const student = await createUser("student");
      const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
        fields: { titleEn: `Mail down ${student.username}` }
      });
      expect(response.status).toBe(201);
      createdIds.push(response.body.id);
      await delay(500);
      const followUp = await studentSubmissions(student.token, student.id);
      expect(followUp.status).toBe(200);
    } finally {
      await setMailSettings({
        smtp_host: "127.0.0.1",
        smtp_port: "1025",
        smtp_from: "Thesis Portal <noreply@localhost>"
      });
    }
  });
});

async function assertMailpit() {
  try {
    const response = await fetch(`${MAILPIT}/api/v1/info`);
    if (!response.ok) {
      throw new Error(String(response.status));
    }
  } catch {
    throw new Error("Mailpit is not running. Start it with: docker compose up -d mailpit");
  }
}

async function setMailSettings(values: Record<string, string>) {
  const client = new Client({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.POSTGRES_USER || "thesis_user",
    password: process.env.POSTGRES_PASSWORD || "thesis_pass",
    database: process.env.POSTGRES_DB || "thesis_test"
  });
  await client.connect();
  try {
    for (const [key, value] of Object.entries(values)) {
      await client.query(`UPDATE system_settings SET value = $2, updated_at = NOW() WHERE key = $1`, [key, value]);
    }
  } finally {
    await client.end();
  }
}

function addressedTo(message: MailSummary, address: string): boolean {
  return (message.To || []).some((item) => String(item.Address || "").toLowerCase() === address.toLowerCase());
}

async function messagesTo(address: string, title: string): Promise<MailSummary[]> {
  const query = `to:${address} ${title}`;
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(`Mailpit search failed: ${response.status}`);
  }
  const body = (await response.json()) as { messages?: MailSummary[] };
  return (body.messages || []).filter((message) => addressedTo(message, address));
}

async function waitForMail(title: string, address: string): Promise<MailSummary> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const found = await messagesTo(address, title);
    if (found[0]) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${found[0].ID}`);
      const body = (await detail.json()) as { Text?: string };
      return { ...found[0], Text: body.Text || "" };
    }
    await delay(250);
  }
  throw new Error(`No email about "${title}" to ${address}`);
}

async function clearMailbox() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
