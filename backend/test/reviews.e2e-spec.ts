import {
  DIRECTOR1,
  LIBRARY1,
  REVIEWER1,
  closeApi,
  createUser,
  deleteSubmission,
  errorText,
  ensureOpenPeriod,
  http,
  initApi,
  login,
  studentSubmissions,
  submitThesis,
  type TestUser
} from "./helpers";

describe("Approve and reject", () => {
  let periodId = "";
  let libraryToken = "";
  let directorToken = "";
  let reviewerToken = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    await initApi();
    periodId = (await ensureOpenPeriod()).periodId;
    libraryToken = (await login(LIBRARY1.username, LIBRARY1.password)).token;
    directorToken = (await login(DIRECTOR1.username, DIRECTOR1.password)).token;
    reviewerToken = (await login(REVIEWER1.username, REVIEWER1.password)).token;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteSubmission(libraryToken, id);
    }
    await closeApi();
  });

  async function freshSubmission(reviewerIds = [REVIEWER1.id]) {
    const student = await createUser("student");
    const response = await submitThesis(student.token, periodId, student.id, reviewerIds);
    expect(response.status).toBe(201);
    createdIds.push(response.body.id);
    return { student, id: response.body.id as string };
  }

  async function rowOf(student: TestUser, id: string) {
    const list = await studentSubmissions(student.token, student.id);
    return list.body.find((item: { id: string }) => item.id === id);
  }

  it("TC-REV-001 shows only submissions assigned to the reviewer", async () => {
    const other = await createUser("reviewer");
    const assigned = await freshSubmission([REVIEWER1.id]);
    const notAssigned = await freshSubmission([other.id]);
    const queue = await http().get("/reviews/my-queue").set("Authorization", `Bearer ${reviewerToken}`);
    const ids = queue.body.map((item: { id: string }) => item.id);
    expect(ids).toContain(assigned.id);
    expect(ids).not.toContain(notAssigned.id);
    const otherQueue = await http().get("/reviews/my-queue").set("Authorization", `Bearer ${other.token}`);
    const otherIds = otherQueue.body.map((item: { id: string }) => item.id);
    expect(otherIds).toContain(notAssigned.id);
    expect(otherIds).not.toContain(assigned.id);
  });

  it("TC-REV-002 keeps status reviewing and opens the library queue after the only reviewer approves", async () => {
    const { student, id } = await freshSubmission();
    const approved = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    expect(approved.status).toBe(201);
    const row = await rowOf(student, id);
    expect(row.status).toBe("reviewing");
    expect(row.reviews[0].decision).toBe("approved");
    const mine = await http().get("/reviews/my-queue").set("Authorization", `Bearer ${reviewerToken}`);
    expect(mine.body.some((item: { id: string; my_decision: string }) => item.id === id && item.my_decision === "approved")).toBe(true);
    const queue = await http().get("/reviews/library-queue").set("Authorization", `Bearer ${libraryToken}`);
    expect(queue.body.some((item: { id: string }) => item.id === id)).toBe(true);
  });

  it("TC-REV-003 waits for every reviewer before library intake", async () => {
    const second = await createUser("reviewer");
    const { student, id } = await freshSubmission([REVIEWER1.id, second.id]);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    expect((await rowOf(student, id)).status).toBe("reviewing");
    let queue = await http().get("/reviews/library-queue").set("Authorization", `Bearer ${libraryToken}`);
    expect(queue.body.some((item: { id: string }) => item.id === id)).toBe(false);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${second.token}`)
      .send({ submissionId: id, action: "approve" });
    queue = await http().get("/reviews/library-queue").set("Authorization", `Bearer ${libraryToken}`);
    expect(queue.body.some((item: { id: string }) => item.id === id)).toBe(true);
    expect((await rowOf(student, id)).status).toBe("reviewing");
  });

  it("TC-REV-004 requires a comment when a reviewer rejects", async () => {
    const { student, id } = await freshSubmission();
    const rejected = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "reject" });
    expect(rejected.status).toBe(400);
    expect(errorText(rejected.body)).toContain("Reject reason is required");
    expect((await rowOf(student, id)).status).toBe("reviewing");
    expect((await rowOf(student, id)).reviews[0].decision).toBe("pending");
  });

  it("TC-REV-005 stores the reject reason and leaves the library queue", async () => {
    const { student, id } = await freshSubmission();
    const rejected = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "reject", comment: "Scope is too broad" });
    expect(rejected.status).toBe(201);
    const row = await rowOf(student, id);
    expect(row.status).toBe("rejected");
    expect(row.reviews[0].comment).toBe("Scope is too broad");
    const mine = await http().get("/reviews/my-queue").set("Authorization", `Bearer ${reviewerToken}`);
    expect(mine.body.some((item: { id: string; my_decision: string }) => item.id === id && item.my_decision === "reject")).toBe(true);
    const queue = await http().get("/reviews/library-queue").set("Authorization", `Bearer ${libraryToken}`);
    expect(queue.body.some((item: { id: string }) => item.id === id)).toBe(false);
  });

  it("TC-REV-006 blocks a reviewer who is not assigned", async () => {
    const other = await createUser("reviewer");
    const { id } = await freshSubmission();
    const response = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${other.token}`)
      .send({ submissionId: id, action: "approve" });
    expect(response.status).toBe(404);
    expect(errorText(response.body)).toContain("not assigned");
  });

  it("TC-REV-007 blocks a second decision", async () => {
    const moved = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: moved.id, action: "approve" });
    const afterStepMoved = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: moved.id, action: "reject", comment: "Changed my mind" });
    expect(afterStepMoved.status).toBe(400);
    expect(errorText(afterStepMoved.body)).toContain("not waiting for this step");
    expect((await rowOf(moved.student, moved.id)).reviews[0].decision).toBe("approved");

    const second = await createUser("reviewer");
    const pending = await freshSubmission([REVIEWER1.id, second.id]);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: pending.id, action: "approve" });
    const again = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: pending.id, action: "reject", comment: "Changed my mind" });
    expect(again.status).toBe(400);
    expect(errorText(again.body)).toContain("already completed");
    expect((await rowOf(pending.student, pending.id)).status).toBe("reviewing");
  });

  it("TC-REV-008 forbids students and library staff from reviewer actions", async () => {
    const { student, id } = await freshSubmission();
    const asStudent = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${student.token}`)
      .send({ submissionId: id, action: "approve" });
    const asLibrary = await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    expect(asStudent.status).toBe(403);
    expect(asLibrary.status).toBe(403);
  });

  it("TC-LIB-001 approves intake and shows the thesis to the director", async () => {
    const { student, id } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    const approved = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    expect(approved.status).toBe(201);
    expect((await rowOf(student, id)).status).toBe("approved");
    const queue = await http().get("/reviews/director-queue").set("Authorization", `Bearer ${directorToken}`);
    expect(queue.body.some((item: { id: string }) => item.id === id)).toBe(true);
  });

  it("TC-LIB-002 rejects intake and stores the reason", async () => {
    const { student, id } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    const rejected = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "reject", comment: "Missing abstract sections" });
    expect(rejected.status).toBe(201);
    const row = await rowOf(student, id);
    expect(row.status).toBe("rejected");
  });

  it("TC-LIB-003 requires a library reject comment", async () => {
    const { student, id } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    const rejected = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "reject" });
    expect(rejected.status).toBe(400);
    expect(errorText(rejected.body)).toContain("Reject reason is required");
    expect((await rowOf(student, id)).status).toBe("reviewing");
  });

  it("TC-LIB-004 refuses intake while a reviewer is still pending", async () => {
    const second = await createUser("reviewer");
    const { student, id } = await freshSubmission([REVIEWER1.id, second.id]);
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    const response = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    expect(response.status).toBe(400);
    expect(errorText(response.body)).toContain("not waiting for this step");
    expect((await rowOf(student, id)).status).toBe("reviewing");
  });

  it("TC-LIB-005 refuses archive from library staff", async () => {
    const { id } = await freshSubmission();
    const response = await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "archive" });
    expect(response.status).toBe(400);
    expect(errorText(response.body)).toContain("cannot archive");
  });

  it("TC-DIR-001 archives an approved thesis without publishing immediately", async () => {
    const { student, id } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    const archived = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${directorToken}`)
      .send({ submissionId: id, action: "archive" });
    expect(archived.status).toBe(201);
    expect(archived.body.ok).toBe(true);
    expect(archived.body.dspaceDeferred).toBe(true);
    expect((await rowOf(student, id)).status).toBe("archived");
  });

  it("TC-DIR-002 lets the director reject an approved thesis", async () => {
    const { student, id } = await freshSubmission();
    await http()
      .post("/reviews/action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "approve" });
    await http()
      .post("/reviews/library-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "approve" });
    const rejected = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${directorToken}`)
      .send({ submissionId: id, action: "reject", comment: "Hold for metadata review" });
    expect(rejected.status).toBe(201);
    expect((await rowOf(student, id)).status).toBe("rejected");
  });

  it("TC-DIR-003 refuses archive unless the thesis is at the director step", async () => {
    const { student, id } = await freshSubmission();
    const response = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${directorToken}`)
      .send({ submissionId: id, action: "archive" });
    expect(response.status).toBe(400);
    expect(errorText(response.body)).toContain("not waiting for this step");
    expect((await rowOf(student, id)).status).toBe("reviewing");
  });

  it("TC-DIR-004 forbids reviewer and library staff from director actions", async () => {
    const { id } = await freshSubmission();
    const asReviewer = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${reviewerToken}`)
      .send({ submissionId: id, action: "archive" });
    const asLibrary = await http()
      .post("/reviews/director-action")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionId: id, action: "archive" });
    expect(asReviewer.status).toBe(403);
    expect(asLibrary.status).toBe(403);
  });
});
