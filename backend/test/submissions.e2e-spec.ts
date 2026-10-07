import {
  REVIEWER1,
  closeApi,
  createUser,
  deleteSubmission,
  errorText,
  ensureOpenPeriod,
  http,
  initApi,
  login,
  pdfBuffer,
  postMultipart,
  studentSubmissions,
  submitThesis,
  thesisFields,
  type TestUser
} from "./helpers";

describe("Submission, PDF, and resubmit", () => {
  let periodId = "";
  let libraryToken = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    await initApi();
    const period = await ensureOpenPeriod();
    periodId = period.periodId;
    libraryToken = (await login("library1", "library123")).token;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteSubmission(libraryToken, id);
    }
    await closeApi();
  });

  async function freshStudent(): Promise<TestUser> {
    return createUser("student");
  }

  async function submitted(student: TestUser, reviewerIds = [REVIEWER1.id], fields?: Record<string, string>) {
    const response = await submitThesis(student.token, periodId, student.id, reviewerIds, { fields });
    expect(response.status).toBe(201);
    createdIds.push(response.body.id);
    return response.body as { id: string; status: string };
  }

  it("TC-SUB-001 creates a reviewing submission with a pending review", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    expect(body.status).toBe("reviewing");
    const list = await studentSubmissions(student.token, student.id);
    const row = list.body.find((item: { id: string }) => item.id === body.id);
    expect(row.status).toBe("reviewing");
    expect(row.reviews.some((review: { decision: string }) => review.decision === "pending")).toBe(true);
  });

  it("TC-SUB-002 saves a draft then submits it", async () => {
    const student = await freshStudent();
    const draft = await postMultipart(
      "/submissions/drafts",
      student.token,
      { studentId: student.id, titleEn: "Draft title", titleVi: "Nhap" },
      undefined
    );
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe("draft");
    createdIds.push(draft.body.id);
    const fields = thesisFields(periodId, student.id, [REVIEWER1.id], { titleEn: "Draft then submit" });
    const submittedResponse = await postMultipart(
      `/submissions/${draft.body.id}/submit`,
      student.token,
      fields,
      { buffer: pdfBuffer, filename: "thesis-valid.pdf" }
    );
    expect(submittedResponse.status).toBe(201);
    expect(submittedResponse.body.status).toBe("reviewing");
  });

  it("TC-SUB-003 rejects a submission without titles", async () => {
    const student = await freshStudent();
    const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
      omit: ["titleVi", "titleEn"]
    });
    expect(response.status).toBe(400);
    expect(errorText(response.body).length).toBeGreaterThan(0);
  });

  it("TC-SUB-004 rejects a submission without an open period", async () => {
    const student = await freshStudent();
    const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
      omit: ["submissionPeriodId"]
    });
    expect(response.status).toBe(400);
  });

  it("TC-SUB-005 rejects a submission without reviewers", async () => {
    const student = await freshStudent();
    const response = await submitThesis(student.token, periodId, student.id, []);
    expect(response.status).toBe(400);
  });

  it("TC-SUB-006 forbids submitting as another student", async () => {
    const owner = await freshStudent();
    const other = await freshStudent();
    const response = await submitThesis(owner.token, periodId, other.id, [REVIEWER1.id]);
    expect(response.status).toBe(403);
  });

  it("TC-SUB-007 rejects an anonymous submission", async () => {
    const student = await freshStudent();
    const fields = thesisFields(periodId, student.id, [REVIEWER1.id]);
    const response = await postMultipart("/submissions", undefined, fields, {
      buffer: pdfBuffer,
      filename: "thesis-valid.pdf"
    });
    expect(response.status).toBe(401);
  });

  it("TC-SUB-008 allows only one non-draft thesis per student", async () => {
    const student = await freshStudent();
    await submitted(student);
    const second = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id]);
    expect(second.status).toBe(400);
    expect(errorText(second.body)).toContain("Only one thesis");
  });

  it("TC-PDF-001 stores a thesis PDF that the owner can download", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    const list = await studentSubmissions(student.token, student.id);
    const row = list.body.find((item: { id: string }) => item.id === body.id);
    const file = row.files.find((item: { fileType: string }) => item.fileType === "thesis");
    expect(file).toBeTruthy();
    const download = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${student.token}`);
    expect(download.status).toBe(200);
    expect(String(download.headers["content-type"])).toContain("application/pdf");
  });

  it("TC-PDF-002 rejects submit when the PDF is missing", async () => {
    const student = await freshStudent();
    const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], { file: null });
    expect(response.status).toBe(400);
    expect(errorText(response.body)).toContain("Thesis PDF is required");
  });

  it("TC-PDF-003 rejects a non-PDF upload", async () => {
    const student = await freshStudent();
    const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
      file: { buffer: Buffer.from("not a pdf"), filename: "notes.txt", contentType: "text/plain" }
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(errorText(response.body).toLowerCase()).toContain("pdf");
  });

  it("TC-PDF-004 rejects a PDF larger than the configured limit", async () => {
    const student = await freshStudent();
    const limit = await http().get("/submissions/upload-limit").set("Authorization", `Bearer ${student.token}`);
    expect(limit.status).toBe(200);
    const maxMb = Number(limit.body.maxFileSizeMb);
    expect(maxMb).toBeGreaterThan(0);
    const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
      file: {
        buffer: Buffer.alloc(maxMb * 1024 * 1024 + 1, 1),
        filename: "too-large.pdf",
        contentType: "application/pdf"
      }
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(errorText(response.body)).toContain(`${maxMb} MB`);
  });

  it("TC-PDF-005 accepts a PDF filename with spaces and unicode", async () => {
    const student = await freshStudent();
    const response = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
      file: { buffer: pdfBuffer, filename: "đề tài luận văn.pdf", contentType: "application/pdf" }
    });
    expect(response.status).toBe(201);
    createdIds.push(response.body.id);
  });

  it("TC-PDF-006 enforces download permissions", async () => {
    const owner = await freshStudent();
    const other = await freshStudent();
    const body = await submitted(owner);
    const list = await studentSubmissions(owner.token, owner.id);
    const file = list.body
      .find((item: { id: string }) => item.id === body.id)
      .files.find((item: { fileType: string }) => item.fileType === "thesis");
    const reviewer = await login(REVIEWER1.username, REVIEWER1.password);
    const outsider = await createUser("reviewer");
    const library = libraryToken;
    const director = (await login("director1", "director123")).token;

    const ownerDownload = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${owner.token}`);
    const reviewerDownload = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${reviewer.token}`);
    const libraryDownload = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${library}`);
    const directorDownload = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${director}`);
    const otherDownload = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${other.token}`);
    const strangerDownload = await http()
      .get(`/submissions/${body.id}/files/${file.id}/download`)
      .set("Authorization", `Bearer ${outsider.token}`);
    const anonymous = await http().get(`/submissions/${body.id}/files/${file.id}/download`);

    expect(ownerDownload.status).toBe(200);
    expect(reviewerDownload.status).toBe(200);
    expect(libraryDownload.status).toBe(200);
    expect(directorDownload.status).toBe(200);
    expect(otherDownload.status).toBe(403);
    expect(strangerDownload.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it("TC-PDF-007 keeps the existing PDF when resubmitting without a new file", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${(await login(REVIEWER1.username, REVIEWER1.password)).token}`)
      .send({ submissionId: body.id, action: "reject", comment: "Fix the abstract" });
    const before = await studentSubmissions(student.token, student.id);
    const fileBefore = before.body
      .find((item: { id: string }) => item.id === body.id)
      .files.find((item: { fileType: string }) => item.fileType === "thesis");
    const again = await postMultipart(
      `/submissions/${body.id}/submit`,
      student.token,
      thesisFields(periodId, student.id, [REVIEWER1.id], { titleEn: "Resubmit keep pdf" })
    );
    expect(again.status).toBe(201);
    const after = await studentSubmissions(student.token, student.id);
    const fileAfter = after.body
      .find((item: { id: string }) => item.id === body.id)
      .files.find((item: { fileType: string }) => item.fileType === "thesis");
    expect(fileAfter.id).toBe(fileBefore.id);
    expect(after.body.find((item: { id: string }) => item.id === body.id).status).toBe("reviewing");
  });

  it("TC-RES-001 resubmits after reviewer rejection and resets the review", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    const reviewer = await login(REVIEWER1.username, REVIEWER1.password);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ submissionId: body.id, action: "reject", comment: "Need a clearer method" });
    const again = await postMultipart(
      `/submissions/${body.id}/submit`,
      student.token,
      thesisFields(periodId, student.id, [REVIEWER1.id], { titleEn: "After reviewer reject" })
    );
    expect(again.status).toBe(201);
    expect(again.body.status).toBe("reviewing");
    const list = await studentSubmissions(student.token, student.id);
    const row = list.body.find((item: { id: string }) => item.id === body.id);
    expect(row.reviews.every((review: { decision: string }) => review.decision === "pending")).toBe(true);
    const queue = await http().get("/reviews/my-queue").set("Authorization", `Bearer ${reviewer.token}`);
    expect(queue.body.some((item: { id: string; my_decision: string }) => item.id === body.id && item.my_decision === "pending")).toBe(
      true
    );
  });

  it("TC-RES-002 resubmits after library rejection", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    const reviewer = await login(REVIEWER1.username, REVIEWER1.password);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ submissionId: body.id, action: "approve" });
    const rejected = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: body.id, action: "reject", comment: "Metadata incomplete" });
    expect(rejected.status).toBe(201);
    const again = await postMultipart(
      `/submissions/${body.id}/submit`,
      student.token,
      thesisFields(periodId, student.id, [REVIEWER1.id], { titleEn: "After library reject" })
    );
    expect(again.status).toBe(201);
    expect(again.body.status).toBe("reviewing");
  });

  it("TC-RES-003 resubmits an approved thesis before archive", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    const reviewer = await login(REVIEWER1.username, REVIEWER1.password);
    const director = await login("director1", "director123");
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ submissionId: body.id, action: "approve" });
    await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: body.id, action: "approve" });
    const again = await postMultipart(
      `/submissions/${body.id}/submit`,
      student.token,
      thesisFields(periodId, student.id, [REVIEWER1.id], { titleEn: "Revise before archive" })
    );
    expect(again.status).toBe(201);
    expect(again.body.status).toBe("reviewing");
    const queue = await http().get("/reviews/director-queue").set("Authorization", `Bearer ${director.token}`);
    expect(queue.body.some((item: { id: string }) => item.id === body.id)).toBe(false);
  });

  it("TC-RES-004 refuses resubmit after archive", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    const reviewer = await login(REVIEWER1.username, REVIEWER1.password);
    const director = await login("director1", "director123");
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ submissionId: body.id, action: "approve" });
    await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: body.id, action: "approve" });
    const archived = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${director.token}`)
      .send({ submissionId: body.id, action: "archive" });
    expect(archived.body.dspaceDeferred).toBe(true);
    const again = await postMultipart(
      `/submissions/${body.id}/submit`,
      student.token,
      thesisFields(periodId, student.id, [REVIEWER1.id])
    );
    expect(again.status).toBe(400);
    expect(errorText(again.body)).toContain("cannot be submitted");
  });

  it("TC-RES-005 refuses another submit while a reviewer has already decided", async () => {
    const student = await freshStudent();
    const body = await submitted(student);
    const reviewer = await login(REVIEWER1.username, REVIEWER1.password);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewer.token}`)
      .send({ submissionId: body.id, action: "approve" });
    const again = await postMultipart(
      `/submissions/${body.id}/submit`,
      student.token,
      thesisFields(periodId, student.id, [REVIEWER1.id])
    );
    expect(again.status).toBe(400);
    expect(errorText(again.body)).toContain("cannot be submitted");
  });

});
