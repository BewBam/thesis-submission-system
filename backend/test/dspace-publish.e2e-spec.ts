import {
  DIRECTOR1,
  LIBRARY1,
  REVIEWER1,
  TEST_COLLECTION_ID,
  closeApi,
  createUser,
  deleteSubmission,
  errorText,
  ensureOpenPeriod,
  http,
  initApi,
  isRemote,
  login,
  studentSubmissions,
  submitThesis
} from "./helpers";

describe("Push to DSpace level A", () => {
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

  async function archiveOne() {
    const student = await createUser("student");
    const created = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id]);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    createdIds.push(id);
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
    return { student, id, archived };
  }

  async function statusOf(token: string, studentId: string, id: string) {
    const list = await studentSubmissions(token, studentId);
    return list.body.find((item: { id: string }) => item.id === id);
  }

  it("TC-DSP-001 archives in the portal before any publish call", async () => {
    const { student, id, archived } = await archiveOne();
    expect(archived.status).toBe(201);
    expect(archived.body.dspaceDeferred).toBe(true);
    expect((await statusOf(student.token, student.id, id)).status).toBe("archived");
  });

  it("TC-DSP-002 rejects publish without a collection or submissions", async () => {
    const { id } = await archiveOne();
    const missingCollection = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionIds: [id] });
    const emptyIds = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionIds: [], collectionId: TEST_COLLECTION_ID });
    expect(missingCollection.status).toBe(400);
    expect(emptyIds.status).toBe(400);
  });

  it("TC-DSP-003 skips publish for a thesis that is still reviewing", async () => {
    const student = await createUser("student");
    const created = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id]);
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    createdIds.push(id);
    const published = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionIds: [id], collectionId: TEST_COLLECTION_ID });
    expect(published.status).toBe(201);
    expect(published.body.results[0].ok).toBe(false);
    expect(String(published.body.results[0].message).toLowerCase()).toContain("skip");
    expect((await statusOf(student.token, student.id, id)).status).toBe("reviewing");
  });

  it("TC-DSP-004 forbids students and reviewers from publishing", async () => {
    const { student, id } = await archiveOne();
    const reviewer = reviewerToken;
    const asStudent = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${student.token}`)
      .send({ submissionIds: [id], collectionId: TEST_COLLECTION_ID });
    const asReviewer = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${reviewer}`)
      .send({ submissionIds: [id], collectionId: TEST_COLLECTION_ID });
    expect(asStudent.status).toBe(403);
    expect(asReviewer.status).toBe(403);
  });

  it("TC-DSP-005 keeps the archived thesis when DSpace is missing or fails", async () => {
    const { student, id } = await archiveOne();
    const published = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionIds: [id], collectionId: TEST_COLLECTION_ID });
    expect(published.status).toBe(201);
    const result = published.body.results[0];
    const itemId = String(result.dspaceItemId || "");
    if (!isRemote()) {
      expect(itemId.startsWith("dev-item-")).toBe(true);
      expect(result.ok).toBe(true);
    } else {
      const acceptable = result.ok === true || result.ok === false;
      expect(acceptable).toBe(true);
      if (itemId) {
        expect(itemId.length).toBeGreaterThan(8);
      }
    }
    const row = await statusOf(student.token, student.id, id);
    expect(row.status).toBe("archived");
    expect(errorText(result)).not.toContain("deleted");
  });
});
