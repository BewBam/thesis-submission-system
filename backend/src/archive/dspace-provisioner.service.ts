import { Injectable, Logger } from "@nestjs/common";
import FormDataNode = require("form-data");
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import http = require("node:http");
import https = require("node:https");
import type { IncomingMessage } from "node:http";
import { createPgPool } from "../users/db-pool";

export type DspaceProvisionResult = {
  id: string;
  mode: "dspace" | "dev";
};

/** Bearer + CSRF session for DSpace 7 REST (cookie jar is required for Invalid CSRF). */
type SessionCache = {
  token: string;
  xsrf: string;
  cookieHeader: string;
  loadedAt: number;
};

/** DSpace JWT sessions are typically short-lived; refresh proactively. */
const TOKEN_TTL_MS = 25 * 60 * 1000;

@Injectable()
export class DspaceProvisionerService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(DspaceProvisionerService.name);
  private sessionCache: SessionCache | null = null;

  private async getSetting(key: string): Promise<string> {
    const envMap: Record<string, string | undefined> = {
      dspace_api_base_url: process.env.DSPACE_API_BASE_URL,
      dspace_api_user: process.env.DSPACE_API_USER,
      dspace_api_password: process.env.DSPACE_API_PASSWORD,
      dspace_api_token: process.env.DSPACE_API_TOKEN,
      dspace_root_community_id: process.env.DSPACE_ROOT_COMMUNITY_ID
    };
    const fromEnv = envMap[key]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
    const result = await this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    return result.rows[0]?.value?.trim() || "";
  }

  /**
   * Normalize REST base URL.
   * Must be the backend REST root (…/server), NOT the Angular UI (…/server/#/… or …:4000).
   */
  private normalizeRestBaseUrl(raw: string): string {
    let value = String(raw || "").trim();
    if (!value) {
      return "";
    }
    // Strip hash/UI routes people often paste from the browser address bar.
    const hashIndex = value.indexOf("#");
    if (hashIndex >= 0) {
      value = value.slice(0, hashIndex);
    }
    // Drop query string.
    const queryIndex = value.indexOf("?");
    if (queryIndex >= 0) {
      value = value.slice(0, queryIndex);
    }
    value = value.replace(/\/+$/, "");
    // If someone pasted …/server/api or …/server/api/… keep only …/server
    value = value.replace(/\/api(?:\/.*)?$/i, "");
    value = value.replace(/\/+$/, "");
    return value;
  }

  private async getBaseUrl(): Promise<string> {
    const raw = await this.getSetting("dspace_api_base_url");
    const normalized = this.normalizeRestBaseUrl(raw);
    if (raw && normalized && raw.replace(/\/$/, "") !== normalized) {
      this.logger.warn(
        `Normalized dspace_api_base_url from "${raw}" to "${normalized}" (use REST root …/server, not UI hash URL)`
      );
    }
    return normalized;
  }

  /** Configured when base URL exists and either user/password or a static token is set. */
  private async isDspaceConfigured(): Promise<boolean> {
    const baseUrl = await this.getBaseUrl();
    if (!baseUrl) {
      return false;
    }
    const user = await this.getSetting("dspace_api_user");
    const password = await this.getSetting("dspace_api_password");
    if (user && password) {
      return true;
    }
    const token = await this.getSetting("dspace_api_token");
    return Boolean(token);
  }

  clearTokenCache() {
    this.sessionCache = null;
  }

  private readSetCookies(response: Response): string[] {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof headers.getSetCookie === "function") {
      return headers.getSetCookie();
    }
    const single = response.headers.get("set-cookie");
    return single ? [single] : [];
  }

  private mergeCookieHeader(existing: string, response: Response): string {
    const jar = this.parseCookieJar(existing);
    for (const raw of this.readSetCookies(response)) {
      const first = raw.split(";")[0] || "";
      const eq = first.indexOf("=");
      if (eq > 0) {
        jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    }
    return this.formatCookieJar(jar);
  }

  private parseCookieJar(existing: string): Map<string, string> {
    const jar = new Map<string, string>();
    if (!existing) {
      return jar;
    }
    for (const part of existing.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) {
        jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
      }
    }
    return jar;
  }

  private formatCookieJar(jar: Map<string, string>): string {
    return Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private withXsrfCookie(cookieHeader: string, xsrf: string): string {
    const jar = this.parseCookieJar(cookieHeader);
    jar.set("DSPACE-XSRF-COOKIE", xsrf);
    return this.formatCookieJar(jar);
  }

  private xsrfFromCookieHeader(cookieHeader: string): string {
    return this.parseCookieJar(cookieHeader).get("DSPACE-XSRF-COOKIE") || "";
  }

  private readSetCookiesFromNode(response: IncomingMessage): string[] {
    const raw = response.headers["set-cookie"];
    if (!raw) {
      return [];
    }
    return Array.isArray(raw) ? raw : [raw];
  }

  private mergeCookieHeaderFromNode(existing: string, response: IncomingMessage): string {
    const jar = this.parseCookieJar(existing);
    for (const raw of this.readSetCookiesFromNode(response)) {
      const first = raw.split(";")[0] || "";
      const eq = first.indexOf("=");
      if (eq > 0) {
        jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
      }
    }
    return this.formatCookieJar(jar);
  }

  private updateSessionFromNodeResponse(response: IncomingMessage) {
    if (!this.sessionCache) {
      return;
    }
    const nextCookies = this.mergeCookieHeaderFromNode(this.sessionCache.cookieHeader, response);
    const headerXsrf = String(
      response.headers["dspace-xsrf-token"] || response.headers["DSPACE-XSRF-TOKEN"] || ""
    ).trim();
    const nextXsrf = headerXsrf || this.xsrfFromCookieHeader(nextCookies) || this.sessionCache.xsrf;
    this.sessionCache = {
      ...this.sessionCache,
      xsrf: nextXsrf,
      cookieHeader: this.withXsrfCookie(nextCookies, nextXsrf)
    };
  }

  private formatFetchError(url: string, error: unknown): Error {
    const base = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeDetail =
      cause instanceof Error
        ? cause.message
        : cause != null
          ? String(cause)
          : "";
    const detail =
      causeDetail && causeDetail !== base ? `${base} — ${causeDetail}` : base;
    return new Error(
      `Cannot reach DSpace at ${url}: ${detail}. Check dspace_api_base_url (or DSPACE_API_BASE_URL); from Docker use http://host.docker.internal:<port>/server if DSpace runs on the host.`
    );
  }

  private async fetchDspace(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw this.formatFetchError(url, error);
    }
  }

  private async fetchCsrf(baseUrl: string, cookieHeader = ""): Promise<{ xsrf: string; cookieHeader: string }> {
    const candidates = [`${baseUrl}/api/security/csrf`, `${baseUrl}/api`];
    let lastDetail = "";

    for (const url of candidates) {
      const headers: Record<string, string> = { Accept: "application/json, text/plain, */*" };
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }
      const response = await this.fetchDspace(url, { method: "GET", headers });
      const nextCookies = this.mergeCookieHeader(cookieHeader, response);
      const headerXsrf = (
        response.headers.get("DSPACE-XSRF-TOKEN") ||
        response.headers.get("dspace-xsrf-token") ||
        // Some proxies rewrite underscore headers.
        response.headers.get("DSPACE-XSRFTOKEN") ||
        response.headers.get("dspace-xsrftoken") ||
        ""
      ).trim();
      const xsrf = headerXsrf || this.xsrfFromCookieHeader(nextCookies);
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const preview = (await response.clone().text().catch(() => "")).slice(0, 180);

      if (xsrf) {
        return { xsrf, cookieHeader: this.withXsrfCookie(nextCookies, xsrf) };
      }

      if (contentType.includes("text/html") || preview.trimStart().toLowerCase().startsWith("<!doctype")) {
        lastDetail =
          `Got HTML instead of DSpace REST from ${url}. ` +
          `Set dspace_api_base_url to the REST root (e.g. http://dspace.lib.test/server), not the Angular UI URL.`;
        continue;
      }

      if (!response.ok) {
        lastDetail = `CSRF request failed (${response.status}) at ${url}: ${preview}`;
        continue;
      }

      lastDetail =
        `CSRF response OK at ${url} but no DSPACE-XSRF-TOKEN header/cookie. ` +
        `If DSpace sits behind nginx, enable "underscores_in_headers on;" so DSPACE-XSRF-TOKEN is not dropped.`;
      cookieHeader = nextCookies;
    }

    throw new Error(lastDetail || "DSpace CSRF OK but no DSPACE-XSRF-TOKEN");
  }

  private extractBearer(response: Response, bodyText: string): string | null {
    const authHeader = response.headers.get("authorization") || response.headers.get("Authorization");
    if (authHeader) {
      const match = authHeader.match(/Bearer\s+(.+)/i);
      return (match?.[1] || authHeader).trim();
    }
    try {
      const payload = JSON.parse(bodyText) as { token?: string; accessToken?: string };
      return (payload.token || payload.accessToken || "").trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * DSpace 7 login: GET /api/security/csrf then POST /api/authn/login with
   * X-XSRF-TOKEN + DSPACE-XSRF-COOKIE (same flow as scripts/dspace-seed-hierarchy.*).
   */
  private async loginWithCsrf(baseUrl: string): Promise<SessionCache> {
    const user = await this.getSetting("dspace_api_user");
    const password = await this.getSetting("dspace_api_password");
    if (!user || !password) {
      throw new Error("DSpace login requires dspace_api_user and dspace_api_password");
    }

    const csrf = await this.fetchCsrf(baseUrl);
    const response = await this.fetchDspace(`${baseUrl}/api/authn/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "X-XSRF-TOKEN": csrf.xsrf,
        Cookie: csrf.cookieHeader
      },
      body: new URLSearchParams({ user, password }).toString()
    });

    const bodyText = await response.text();
    const cookieHeader = this.mergeCookieHeader(csrf.cookieHeader, response);
    const rotated = (
      response.headers.get("DSPACE-XSRF-TOKEN") ||
      response.headers.get("dspace-xsrf-token") ||
      this.xsrfFromCookieHeader(cookieHeader) ||
      csrf.xsrf
    ).trim();

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          `DSpace login failed (401 Authentication failed) for user "${user}" at ${baseUrl}/api/authn/login. ` +
            `Check dspace_api_user / dspace_api_password (must be a DSpace EPerson email that can use password auth).`
        );
      }
      throw new Error(`DSpace login failed (${response.status}) at ${baseUrl}/api/authn/login: ${bodyText}`);
    }

    const token = this.extractBearer(response, bodyText);
    if (!token) {
      throw new Error("DSpace login succeeded but no Authorization token was returned");
    }

    return {
      token,
      xsrf: rotated,
      cookieHeader: this.withXsrfCookie(cookieHeader, rotated),
      loadedAt: Date.now()
    };
  }

  /** Static bearer still needs a fresh CSRF pair for mutating REST calls. */
  private async sessionFromStaticToken(baseUrl: string, token: string): Promise<SessionCache> {
    const csrf = await this.fetchCsrf(baseUrl);
    return {
      token,
      xsrf: csrf.xsrf,
      cookieHeader: csrf.cookieHeader,
      loadedAt: Date.now()
    };
  }

  private async resolveSession(forceRefresh = false): Promise<SessionCache> {
    if (!forceRefresh && this.sessionCache && Date.now() - this.sessionCache.loadedAt < TOKEN_TTL_MS) {
      return this.sessionCache;
    }

    const baseUrl = await this.getBaseUrl();
    const user = await this.getSetting("dspace_api_user");
    const password = await this.getSetting("dspace_api_password");

    if (user && password) {
      this.sessionCache = await this.loginWithCsrf(baseUrl);
      this.logger.log("Obtained DSpace access token via CSRF auto-login");
      return this.sessionCache;
    }

    const staticToken = await this.getSetting("dspace_api_token");
    if (staticToken) {
      this.sessionCache = await this.sessionFromStaticToken(baseUrl, staticToken);
      return this.sessionCache;
    }

    throw new Error("DSpace is not configured with credentials or token");
  }

  private async dspaceRequestRaw(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    retried = false
  ): Promise<unknown> {
    const baseUrl = await this.getBaseUrl();
    let session: SessionCache;
    try {
      session = await this.resolveSession(retried);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.token}`,
      Accept: "application/json",
      "X-XSRF-TOKEN": session.xsrf,
      Cookie: session.cookieHeader
    };
    // Avoid Content-Type on GET — some DSpace/proxy setups mishandle empty JSON bodies.
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    const response = await this.fetchDspace(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    // Keep CSRF cookie/header in sync if DSpace rotates them.
    if (this.sessionCache) {
      const nextCookies = this.mergeCookieHeader(this.sessionCache.cookieHeader, response);
      const nextXsrf = (
        response.headers.get("DSPACE-XSRF-TOKEN") ||
        response.headers.get("dspace-xsrf-token") ||
        this.xsrfFromCookieHeader(nextCookies) ||
        this.sessionCache.xsrf
      ).trim();
      this.sessionCache = {
        ...this.sessionCache,
        xsrf: nextXsrf,
        cookieHeader: this.withXsrfCookie(nextCookies, nextXsrf)
      };
    }

    if ((response.status === 401 || response.status === 403) && !retried) {
      this.logger.warn(`DSpace returned ${response.status}; refreshing CSRF session and retrying once`);
      this.clearTokenCache();
      return this.dspaceRequestRaw(method, path, body, true);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DSpace ${method} ${path} failed (${response.status}): ${text}`);
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  private async dspaceRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    retried = false
  ): Promise<{ id: string }> {
    const payload = (await this.dspaceRequestRaw(method, path, body, retried)) as {
      id?: string;
      uuid?: string;
    } | null;
    const id = payload?.id || payload?.uuid;
    if (!id) {
      throw new Error("DSpace response missing community/collection id");
    }
    return { id };
  }

  private dspaceMultipart(
    path: string,
    buildForm: () => FormDataNode,
    retried = false
  ): Promise<{ id: string }> {
    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          const baseUrl = await this.getBaseUrl();
          const session = await this.resolveSession(retried);
          const url = new URL(`${baseUrl}${path}`);
          const transport = url.protocol === "https:" ? https : http;
          const form = buildForm();

          const startRequest = (contentLength?: number) => {
            const headers: Record<string, string | number> = {
              Authorization: `Bearer ${session.token}`,
              Accept: "application/json",
              "X-XSRF-TOKEN": session.xsrf,
              Cookie: session.cookieHeader,
              ...form.getHeaders()
            };
            if (contentLength !== undefined) {
              headers["Content-Length"] = contentLength;
            }

            const req = transport.request(
              {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port || (url.protocol === "https:" ? 443 : 80),
                path: `${url.pathname}${url.search}`,
                method: "POST",
                headers
              },
              (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk: Buffer | string) => {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });
                res.on("end", () => {
                  void (async () => {
                    this.updateSessionFromNodeResponse(res);
                    const text = Buffer.concat(chunks).toString("utf8");
                    const status = res.statusCode || 0;

                    if ((status === 401 || status === 403) && !retried) {
                      this.logger.warn(
                        `DSpace multipart returned ${status}; refreshing CSRF and retrying once`
                      );
                      this.clearTokenCache();
                      try {
                        resolve(await this.dspaceMultipart(path, buildForm, true));
                      } catch (retryError) {
                        reject(retryError);
                      }
                      return;
                    }

                    if (status < 200 || status >= 300) {
                      reject(new Error(`DSpace POST ${path} failed (${status}): ${text}`));
                      return;
                    }

                    try {
                      const payload = JSON.parse(text) as { id?: string; uuid?: string };
                      const id = payload?.id || payload?.uuid;
                      if (!id) {
                        reject(new Error("DSpace bitstream response missing id"));
                        return;
                      }
                      resolve({ id });
                    } catch {
                      reject(new Error(`DSpace bitstream response invalid JSON: ${text}`));
                    }
                  })();
                });
              }
            );

            req.on("error", reject);
            form.pipe(req);
          };

          form.getLength((lengthErr, length) => {
            if (lengthErr || length === undefined) {
              startRequest();
              return;
            }
            startRequest(length);
          });
        } catch (error) {
          reject(error);
        }
      })();
    });
  }

  private metaTitle(value: string) {
    return {
      name: value,
      metadata: {
        "dc.title": [{ value, language: null, authority: null, confidence: -1 }]
      }
    };
  }

  private extractDspaceName(entry: Record<string, unknown>): string {
    if (typeof entry.name === "string" && entry.name.trim()) {
      return entry.name.trim();
    }
    const metadata = entry.metadata as Record<string, Array<{ value?: string }>> | undefined;
    const title = metadata?.["dc.title"]?.[0]?.value;
    if (typeof title === "string" && title.trim()) {
      return title.trim();
    }
    return "";
  }

  private extractDspaceId(entry: Record<string, unknown>): string {
    const id = entry.id || entry.uuid;
    return id ? String(id) : "";
  }

  private extractEmbeddedRows(
    payload: { _embedded?: Record<string, unknown> } | null,
    preferredKey: string
  ): unknown[] {
    const embedded = payload?._embedded;
    if (!embedded || typeof embedded !== "object") {
      return [];
    }
    const preferred = embedded[preferredKey];
    if (Array.isArray(preferred)) {
      return preferred;
    }
    // Some DSpace builds nest or rename the HAL collection key.
    for (const value of Object.values(embedded)) {
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  }

  private async listEmbeddedPages(
    pathPrefix: string,
    embeddedKey: string
  ): Promise<Array<{ id: string; name: string }>> {
    const items: Array<{ id: string; name: string }> = [];
    let page = 0;
    const size = 100;
    for (;;) {
      const sep = pathPrefix.includes("?") ? "&" : "?";
      const payload = (await this.dspaceRequestRaw(
        "GET",
        `${pathPrefix}${sep}page=${page}&size=${size}`
      )) as {
        _embedded?: Record<string, unknown>;
        page?: { totalPages?: number; number?: number };
      } | null;

      const rows = this.extractEmbeddedRows(payload, embeddedKey);
      for (const row of rows) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const entry = row as Record<string, unknown>;
        const id = this.extractDspaceId(entry);
        const name = this.extractDspaceName(entry);
        if (id) {
          items.push({ id, name: name || id });
        }
      }

      const totalPages = payload?.page?.totalPages ?? 1;
      page += 1;
      if (page >= totalPages || rows.length === 0) {
        break;
      }
    }
    return items;
  }

  async assertConfigured(): Promise<void> {
    if (!(await this.isDspaceConfigured())) {
      throw new Error("DSpace API is not configured (base URL + user/password or token)");
    }
  }

  async isConfigured(): Promise<boolean> {
    return this.isDspaceConfigured();
  }

  /** Smoke-test REST base URL + CSRF + login (for admin diagnostics). */
  async diagnoseConnection(): Promise<{
    ok: boolean;
    baseUrl: string;
    baseUrlRaw: string;
    hasUserPassword: boolean;
    hasToken: boolean;
    csrfOk: boolean;
    loginOk: boolean;
    message: string;
  }> {
    const baseUrlRaw = await this.getSetting("dspace_api_base_url");
    const baseUrl = await this.getBaseUrl();
    const user = await this.getSetting("dspace_api_user");
    const password = await this.getSetting("dspace_api_password");
    const token = await this.getSetting("dspace_api_token");
    const result = {
      ok: false,
      baseUrl,
      baseUrlRaw,
      hasUserPassword: Boolean(user && password),
      hasToken: Boolean(token),
      csrfOk: false,
      loginOk: false,
      message: ""
    };
    if (!baseUrl) {
      result.message = "dspace_api_base_url is empty";
      return result;
    }
    try {
      await this.fetchCsrf(baseUrl);
      result.csrfOk = true;
    } catch (error) {
      result.message = error instanceof Error ? error.message : String(error);
      return result;
    }
    try {
      this.clearTokenCache();
      await this.resolveSession(true);
      result.loginOk = true;
      result.ok = true;
      result.message = "DSpace CSRF + authentication OK";
      return result;
    } catch (error) {
      result.message = error instanceof Error ? error.message : String(error);
      return result;
    }
  }

  async getRootCommunityId(): Promise<string> {
    return this.getSetting("dspace_root_community_id");
  }

  async listSubcommunities(parentCommunityId: string): Promise<Array<{ id: string; name: string }>> {
    await this.assertConfigured();
    return this.listEmbeddedPages(
      `/api/core/communities/${parentCommunityId}/subcommunities`,
      "subcommunities"
    );
  }

  async listCollections(communityId: string): Promise<Array<{ id: string; name: string }>> {
    await this.assertConfigured();
    return this.listEmbeddedPages(`/api/core/communities/${communityId}/collections`, "collections");
  }

  /**
   * RestContract: GET /api/core/communities/search/top
   * (communities with no parent). Falls back to full community list if needed.
   */
  async listTopLevelCommunities(): Promise<Array<{ id: string; name: string }>> {
    await this.assertConfigured();
    try {
      const top = await this.listEmbeddedPages("/api/core/communities/search/top", "communities");
      if (top.length > 0) {
        this.logger.log(`Listed ${top.length} top-level DSpace communities via search/top`);
        return top;
      }
      this.logger.warn("DSpace search/top returned 0 communities; falling back to /api/core/communities");
    } catch (error) {
      this.logger.warn(
        `DSpace search/top failed, falling back to /api/core/communities: ${
          error instanceof Error ? error.message : error
        }`
      );
    }
    const all = await this.listEmbeddedPages("/api/core/communities", "communities");
    this.logger.log(`Listed ${all.length} DSpace communities via /api/core/communities`);
    return all;
  }

  async createFacultyCommunity(name: string): Promise<DspaceProvisionResult> {
    if (!(await this.isDspaceConfigured())) {
      return { id: `dev-community-${randomUUID()}`, mode: "dev" };
    }
    try {
      const parentId = await this.getSetting("dspace_root_community_id");
      const body = this.metaTitle(name);
      // RestContract: POST /api/core/communities?parent=<uuid> (not .../subcommunities)
      const path = parentId
        ? `/api/core/communities?parent=${encodeURIComponent(parentId)}`
        : "/api/core/communities";
      const created = await this.dspaceRequest("POST", path, body);
      return { id: created.id, mode: "dspace" };
    } catch (error) {
      this.logger.warn(`DSpace faculty community fallback: ${error instanceof Error ? error.message : error}`);
      return { id: `dev-community-${randomUUID()}`, mode: "dev" };
    }
  }

  /** Create semester sub-community under faculty (+ optional default collection). */
  async createSemesterStructure(
    facultyCommunityId: string,
    semesterCode: string,
    semesterName: string,
    collectionName: string
  ): Promise<{ communityId: string; collectionId: string; mode: "dspace" | "dev" }> {
    if (!(await this.isDspaceConfigured())) {
      return {
        communityId: `dev-semester-${randomUUID()}`,
        collectionId: `dev-collection-${randomUUID()}`,
        mode: "dev"
      };
    }
    try {
      const sub = await this.dspaceRequest(
        "POST",
        `/api/core/communities?parent=${encodeURIComponent(facultyCommunityId)}`,
        this.metaTitle(semesterName)
      );
      const collection = await this.dspaceRequest(
        "POST",
        `/api/core/collections?parent=${encodeURIComponent(sub.id)}`,
        this.metaTitle(collectionName || `Luận văn – ${semesterCode}`)
      );
      return { communityId: sub.id, collectionId: collection.id, mode: "dspace" };
    } catch (error) {
      this.logger.warn(`DSpace semester structure fallback: ${error instanceof Error ? error.message : error}`);
      return {
        communityId: `dev-semester-${randomUUID()}`,
        collectionId: `dev-collection-${randomUUID()}`,
        mode: "dev"
      };
    }
  }

  /** RestContract: POST /api/core/collections?parent=<communityUUID> */
  async createCollection(parentCommunityId: string, name: string): Promise<DspaceProvisionResult> {
    if (!(await this.isDspaceConfigured())) {
      return { id: `dev-collection-${randomUUID()}`, mode: "dev" };
    }
    try {
      const created = await this.dspaceRequest(
        "POST",
        `/api/core/collections?parent=${encodeURIComponent(parentCommunityId)}`,
        this.metaTitle(name)
      );
      return { id: created.id, mode: "dspace" };
    } catch (error) {
      this.logger.warn(`DSpace collection create fallback: ${error instanceof Error ? error.message : error}`);
      return { id: `dev-collection-${randomUUID()}`, mode: "dev" };
    }
  }

  private buildBitstreamUploadForm(pdfPath: string, fileName: string): FormDataNode {
    const form = new FormDataNode();
    form.append("file", createReadStream(pdfPath), {
      filename: fileName,
      contentType: "application/pdf"
    });
    form.append(
      "properties",
      JSON.stringify({
        name: fileName,
        metadata: {
          "dc.title": [{ value: fileName, language: null, authority: null, confidence: -1 }]
        }
      }),
      { contentType: "application/json" }
    );
    return form;
  }

  private async uploadPdfToBundle(
    bundleId: string,
    pdfPath: string,
    pdfFileName?: string | null
  ): Promise<void> {
    const { access } = await import("node:fs/promises");
    await access(pdfPath);
    const fileName = pdfFileName || "thesis.pdf";
    await this.dspaceMultipart(`/api/core/bundles/${bundleId}/bitstreams`, () =>
      this.buildBitstreamUploadForm(pdfPath, fileName)
    );
  }

  /** Upload thesis PDF into ORIGINAL bundle of an existing DSpace item (retry path). */
  async uploadThesisPdfToItem(
    itemId: string,
    pdfPath: string,
    pdfFileName?: string | null
  ): Promise<boolean> {
    if (!(await this.isDspaceConfigured())) {
      return false;
    }
    if (!itemId || itemId.startsWith("dev-item-")) {
      return false;
    }

    const bundlesPayload = (await this.dspaceRequestRaw(
      "GET",
      `/api/core/items/${itemId}/bundles`
    )) as {
      _embedded?: { bundles?: Array<{ id?: string; uuid?: string; name?: string }> };
    };
    const bundles = bundlesPayload?._embedded?.bundles || [];
    let bundleId =
      bundles.find((b) => b.name === "ORIGINAL")?.id ||
      bundles.find((b) => b.name === "ORIGINAL")?.uuid ||
      null;

    if (bundleId) {
      const bitstreamsPayload = (await this.dspaceRequestRaw(
        "GET",
        `/api/core/bundles/${bundleId}/bitstreams`
      )) as {
        _embedded?: { bitstreams?: unknown[] };
      };
      if ((bitstreamsPayload?._embedded?.bitstreams || []).length > 0) {
        return true;
      }
    } else {
      const bundle = await this.dspaceRequest("POST", `/api/core/items/${itemId}/bundles`, {
        name: "ORIGINAL",
        metadata: {
          "dc.title": [{ value: "ORIGINAL", language: null, authority: null, confidence: -1 }]
        }
      });
      bundleId = bundle.id;
    }

    await this.uploadPdfToBundle(bundleId, pdfPath, pdfFileName);
    return true;
  }

  /** Best-effort delete of an archived DSpace item (204 = success). */
  async deleteItem(itemId: string): Promise<void> {
    if (!(await this.isDspaceConfigured())) {
      return;
    }
    if (!this.isRealDspaceId(itemId)) {
      return;
    }
    await this.dspaceRequestRaw("DELETE", `/api/core/items/${itemId}`);
  }

  private isRealDspaceId(id: string | null | undefined): id is string {
    return Boolean(id && typeof id === "string" && !id.startsWith("dev-"));
  }

  private isDspaceNotFoundError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return msg.includes("(404)") || msg.includes(" 404 ");
  }

  /** Delete a collection; removes contained items first when possible. */
  async deleteCollection(collectionId: string | null | undefined): Promise<boolean> {
    if (!(await this.isDspaceConfigured()) || !this.isRealDspaceId(collectionId)) {
      return false;
    }
    try {
      const items = await this.listEmbeddedPages(
        `/api/core/collections/${collectionId}/items`,
        "items"
      );
      for (const item of items) {
        try {
          await this.deleteItem(item.id);
        } catch (error) {
          if (!this.isDspaceNotFoundError(error)) {
            this.logger.warn(
              `Could not delete DSpace item ${item.id} before collection ${collectionId}: ${
                error instanceof Error ? error.message : error
              }`
            );
          }
        }
      }
      await this.dspaceRequestRaw("DELETE", `/api/core/collections/${collectionId}`);
      return true;
    } catch (error) {
      if (this.isDspaceNotFoundError(error)) {
        return true;
      }
      this.logger.warn(
        `DSpace collection ${collectionId} delete failed: ${
          error instanceof Error ? error.message : error
        }`
      );
      return false;
    }
  }

  /** Delete community recursively (sub-communities and collections first). */
  async deleteCommunity(communityId: string | null | undefined): Promise<boolean> {
    if (!(await this.isDspaceConfigured()) || !this.isRealDspaceId(communityId)) {
      return false;
    }
    try {
      const subcommunities = await this.listEmbeddedPages(
        `/api/core/communities/${communityId}/subcommunities`,
        "subcommunities"
      );
      for (const sub of subcommunities) {
        await this.deleteCommunity(sub.id);
      }

      const collections = await this.listEmbeddedPages(
        `/api/core/communities/${communityId}/collections`,
        "collections"
      );
      for (const col of collections) {
        await this.deleteCollection(col.id);
      }

      await this.dspaceRequestRaw("DELETE", `/api/core/communities/${communityId}`);
      return true;
    } catch (error) {
      if (this.isDspaceNotFoundError(error)) {
        return true;
      }
      this.logger.warn(
        `DSpace community ${communityId} delete failed: ${
          error instanceof Error ? error.message : error
        }`
      );
      return false;
    }
  }

  /**
   * POST /api/core/items?owningCollection=<uuid>
   * then ORIGINAL bundle + optional PDF bitstream.
   * When DSpace is configured, failures throw (no silent fake UUID).
   */
  async publishArchivedItem(input: {
    collectionId: string;
    title: string;
    authors?: string[];
    metadata?: Record<string, string[]>;
    abstractText?: string;
    dateIssued?: string;
    publisher?: string;
    documentType?: string;
    language?: string;
    description?: string;
    pdfPath?: string | null;
    pdfFileName?: string | null;
  }): Promise<{ id: string; mode: "dspace" | "dev"; bitstreamUploaded: boolean }> {
    if (!(await this.isDspaceConfigured())) {
      return { id: `dev-item-${randomUUID()}`, mode: "dev", bitstreamUploaded: false };
    }

    if (!input.collectionId || input.collectionId.startsWith("dev-")) {
      throw new Error("DSpace collection id is missing or still a local placeholder (sync/create period first)");
    }

    const metaValue = (value: string) => ({
      value,
      language: null as string | null,
      authority: null as null,
      confidence: -1
    });

    const metadata: Record<
      string,
      Array<{ value: string; language: string | null; authority: null; confidence: number }>
    > = {};

    if (input.metadata && Object.keys(input.metadata).length > 0) {
      for (const [pathKey, values] of Object.entries(input.metadata)) {
        const list = (values || []).map((v) => String(v).trim()).filter(Boolean);
        if (list.length > 0) {
          metadata[pathKey] = list.map((value) => metaValue(value));
        }
      }
    } else {
      // Legacy fallback when caller does not pass configured metadata map
      metadata["dc.title"] = [metaValue(input.title)];
      const authors = (input.authors || []).map((a) => a.trim()).filter(Boolean);
      if (authors.length > 0) {
        metadata["dc.contributor.author"] = authors.map((value) => metaValue(value));
      }
      if (input.dateIssued?.trim()) {
        metadata["dc.date.issued"] = [metaValue(input.dateIssued.trim())];
      }
      if (input.publisher?.trim()) {
        metadata["dc.publisher"] = [metaValue(input.publisher.trim())];
      }
      metadata["dc.type"] = [metaValue((input.documentType || "Thesis").trim() || "Thesis")];
      if (input.language?.trim()) {
        metadata["dc.language.iso"] = [metaValue(input.language.trim())];
      }
      if (input.abstractText?.trim()) {
        metadata["dc.description.abstract"] = [metaValue(input.abstractText.trim())];
      }
      if (input.description?.trim()) {
        metadata["dc.description"] = [metaValue(input.description.trim())];
      }
    }

    if (!metadata["dc.title"]?.length && input.title) {
      metadata["dc.title"] = [metaValue(input.title)];
    }

    const item = await this.dspaceRequest(
      "POST",
      `/api/core/items?owningCollection=${encodeURIComponent(input.collectionId)}`,
      {
        name: input.title,
        inArchive: true,
        discoverable: true,
        withdrawn: false,
        type: "item",
        metadata
      }
    );

    let bitstreamUploaded = false;
    if (input.pdfPath) {
      try {
        const bundle = await this.dspaceRequest("POST", `/api/core/items/${item.id}/bundles`, {
          name: "ORIGINAL",
          metadata: {
            "dc.title": [{ value: "ORIGINAL", language: null, authority: null, confidence: -1 }]
          }
        });
        await this.uploadPdfToBundle(bundle.id, input.pdfPath, input.pdfFileName);
        bitstreamUploaded = true;
      } catch (error) {
        // Item already created — keep item id but surface bitstream issue to caller via flag + log.
        this.logger.warn(
          `DSpace item ${item.id} created but PDF upload failed: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }

    return { id: item.id, mode: "dspace", bitstreamUploaded };
  }

  /** @deprecated Prefer publishArchivedItem — kept for callers that only need an id string. */
  async publishItemPlaceholder(collectionId: string, title: string): Promise<string> {
    const result = await this.publishArchivedItem({ collectionId, title });
    return result.id;
  }
}
