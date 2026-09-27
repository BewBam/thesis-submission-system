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

const DSPACE_UI = "http://dspace.lib.test";
const DSPACE_BASE = "http://dspace.lib.test/server";
const DSPACE_USER = "tuan.ngonhat@hcmut.edu.vn";
const DSPACE_PASSWORD = "12345678";
const COMMUNITY_NAME = "Nộp luận văn";
const COLLECTION_NAME = "Thạc sĩ";

const describeLive = isRemote() ? describe.skip : describe;

describeLive("Push to DSpace level B (live)", () => {
  let periodId = "";
  let libraryToken = "";
  let directorToken = "";
  let reviewerToken = "";
  let collectionId = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    collectionId = await findCollectionId();
    await initApi();
    await setDspaceSettings({
      dspace_api_base_url: DSPACE_BASE,
      dspace_api_user: DSPACE_USER,
      dspace_api_password: DSPACE_PASSWORD,
      dspace_api_token: ""
    });
    periodId = (await ensureOpenPeriod()).periodId;
    libraryToken = (await login(LIBRARY1.username, LIBRARY1.password)).token;
    directorToken = (await login(DIRECTOR1.username, DIRECTOR1.password)).token;
    reviewerToken = (await login(REVIEWER1.username, REVIEWER1.password)).token;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteSubmission(libraryToken, id);
    }
    await setDspaceSettings({
      dspace_api_base_url: "",
      dspace_api_user: "",
      dspace_api_password: "",
      dspace_api_token: ""
    });
    await closeApi();
  });

  it("TC-DSP-006 publishes an archived thesis, its metadata, and the PDF", async () => {
    const student = await createUser("student");
    const title = `Live DSpace ${student.username}`;
    const created = await submitThesis(student.token, periodId, student.id, [REVIEWER1.id], {
      fields: { titleEn: title, abstract: `Abstract ${student.username}` }
    });
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
    expect(archived.status).toBe(201);

    const published = await http()
      .post("/archive-config/dspace/publish")
      .set("Authorization", `Bearer ${libraryToken}`)
      .send({ submissionIds: [id], collectionId });
    expect(published.status).toBe(201);
    const result = published.body.results[0];
    expect(result.ok).toBe(true);
    expect(result.bitstreamUploaded).toBe(true);
    expect(result.message || "").toContain("Published");
    const itemId = String(result.dspaceItemId || "");
    expect(itemId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(itemId.startsWith("dev-item-")).toBe(false);

    const list = await studentSubmissions(student.token, student.id);
    const row = list.body.find((item: { id: string }) => item.id === id);
    expect(row.status).toBe("archived");
    const stored = await storedPublish(id);
    expect(stored.itemId).toBe(itemId);
    expect(stored.status).toBe("published");

    const item = await dspaceJson(`/api/core/items/${itemId}`);
    const metadata = item.metadata || {};
    expect(valuesOf(metadata, "dc.title")).toContain(title);
    expect(valuesOf(metadata, "dc.type").join(" ").toLowerCase()).toContain("thesis");
    expect(valuesOf(metadata, "dc.description.abstract").join(" ")).toContain(student.username);

    const bundles = await dspaceJson(`/api/core/items/${itemId}/bundles`);
    const original = embedded(bundles, "bundles").find((bundle) => bundle.name === "ORIGINAL");
    expect(original?.uuid || original?.id).toBeTruthy();
    const bitstreams = await dspaceJson(
      `/api/core/bundles/${original.uuid || original.id}/bitstreams`
    );
    expect(embedded(bitstreams, "bitstreams").length).toBeGreaterThan(0);
    console.log(`DSpace item: ${DSPACE_UI}/items/${itemId}`);
  });
});

async function findCollectionId(): Promise<string> {
  const communities = await dspaceJson("/api/core/communities?size=100");
  const community = embedded(communities, "communities").find((row) => row.name === COMMUNITY_NAME);
  if (!community) {
    throw new Error(`DSpace community "${COMMUNITY_NAME}" was not found at ${DSPACE_BASE}`);
  }
  const communityId = community.uuid || community.id;
  const collections = await dspaceJson(`/api/core/communities/${communityId}/collections?size=100`);
  const collection = embedded(collections, "collections").find((row) => row.name === COLLECTION_NAME);
  if (!collection) {
    throw new Error(`DSpace collection "${COLLECTION_NAME}" was not found under "${COMMUNITY_NAME}"`);
  }
  return String(collection.uuid || collection.id);
}

type DspaceSession = { token: string; xsrf: string; cookie: string };

let session: DspaceSession | null = null;

async function dspaceSession(): Promise<DspaceSession> {
  if (session) {
    return session;
  }
  const csrf = await fetch(`${DSPACE_BASE}/api/security/csrf`);
  const xsrf = csrf.headers.get("dspace-xsrf-token") || "";
  let cookie = cookieHeader(csrf);
  if (!xsrf) {
    throw new Error(`No CSRF token from ${DSPACE_BASE}/api/security/csrf`);
  }
  const loginResponse = await fetch(`${DSPACE_BASE}/api/authn/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "X-XSRF-TOKEN": xsrf,
      Cookie: cookie
    },
    body: new URLSearchParams({ user: DSPACE_USER, password: DSPACE_PASSWORD })
  });
  if (!loginResponse.ok) {
    throw new Error(`DSpace login failed (${loginResponse.status}) for ${DSPACE_USER}`);
  }
  const authorization = loginResponse.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw new Error("DSpace login returned no bearer token");
  }
  cookie = [cookie, cookieHeader(loginResponse)].filter(Boolean).join("; ");
  session = {
    token,
    xsrf: loginResponse.headers.get("dspace-xsrf-token") || xsrf,
    cookie
  };
  return session;
}

async function dspaceJson(path: string): Promise<Record<string, any>> {
  const current = await dspaceSession();
  const response = await fetch(`${DSPACE_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${current.token}`,
      "X-XSRF-TOKEN": current.xsrf,
      Cookie: current.cookie
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DSpace ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as Record<string, any>;
}

function cookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const single = response.headers.get("set-cookie");
  const parts = raw.length ? raw : single ? [single] : [];
  return parts.map((part) => part.split(";")[0]).filter(Boolean).join("; ");
}

function embedded(body: Record<string, any>, key: string): Array<Record<string, any>> {
  return body._embedded?.[key] || [];
}

function valuesOf(metadata: Record<string, Array<{ value?: string }>>, key: string): string[] {
  return (metadata[key] || []).map((entry) => String(entry.value || "")).filter(Boolean);
}

async function setDspaceSettings(values: Record<string, string>) {
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
      await client.query(`UPDATE system_settings SET value = $2, updated_at = NOW() WHERE key = $1`, [
        key,
        value
      ]);
    }
  } finally {
    await client.end();
  }
}

async function storedPublish(submissionId: string): Promise<{ itemId: string; status: string }> {
  const client = new Client({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.POSTGRES_USER || "thesis_user",
    password: process.env.POSTGRES_PASSWORD || "thesis_pass",
    database: process.env.POSTGRES_DB || "thesis_test"
  });
  await client.connect();
  try {
    const result = await client.query<{ dspace_item_id: string | null; dspace_publish_status: string }>(
      `SELECT dspace_item_id, dspace_publish_status FROM submissions WHERE id = $1::uuid`,
      [submissionId]
    );
    return {
      itemId: result.rows[0]?.dspace_item_id || "",
      status: result.rows[0]?.dspace_publish_status || ""
    };
  } finally {
    await client.end();
  }
}
