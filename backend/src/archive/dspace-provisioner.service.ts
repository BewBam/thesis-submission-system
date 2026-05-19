import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createPgPool } from "../users/db-pool";

export type DspaceProvisionResult = {
  id: string;
  mode: "dspace" | "dev";
};

@Injectable()
export class DspaceProvisionerService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(DspaceProvisionerService.name);

  private async getSetting(key: string): Promise<string> {
    const result = await this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    return result.rows[0]?.value?.trim() || "";
  }

  private async isDspaceConfigured(): Promise<boolean> {
    const baseUrl = await this.getSetting("dspace_api_base_url");
    const token = await this.getSetting("dspace_api_token");
    return Boolean(baseUrl && token);
  }

  private async dspaceRequest(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<{ id: string }> {
    const baseUrl = (await this.getSetting("dspace_api_base_url")).replace(/\/$/, "");
    const token = await this.getSetting("dspace_api_token");
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DSpace ${method} ${path} failed (${response.status}): ${text}`);
    }
    const payload = (await response.json()) as { id?: string; uuid?: string };
    const id = payload.id || payload.uuid;
    if (!id) {
      throw new Error("DSpace response missing community/collection id");
    }
    return { id };
  }

  async createFacultyCommunity(name: string): Promise<DspaceProvisionResult> {
    if (!(await this.isDspaceConfigured())) {
      return { id: `dev-community-${randomUUID()}`, mode: "dev" };
    }
    try {
      const parentId = await this.getSetting("dspace_root_community_id");
      const body: Record<string, unknown> = {
        name,
        metadata: {
          "dc.title": [{ value: name, language: null, authority: null, confidence: -1, place: 0 }]
        }
      };
      if (parentId) {
        const created = await this.dspaceRequest(
          "POST",
          `/api/core/communities/${parentId}/subcommunities`,
          body
        );
        return { id: created.id, mode: "dspace" };
      }
      const created = await this.dspaceRequest("POST", "/api/core/communities", body);
      return { id: created.id, mode: "dspace" };
    } catch (error) {
      this.logger.warn(`DSpace faculty community fallback: ${error instanceof Error ? error.message : error}`);
      return { id: `dev-community-${randomUUID()}`, mode: "dev" };
    }
  }

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
        `/api/core/communities/${facultyCommunityId}/subcommunities`,
        {
          name: semesterName,
          metadata: {
            "dc.title": [{ value: semesterName, language: null, authority: null, confidence: -1, place: 0 }]
          }
        }
      );
      const collection = await this.dspaceRequest("POST", "/api/core/collections", {
        name: collectionName,
        metadata: {
          "dc.title": [{ value: collectionName, language: null, authority: null, confidence: -1, place: 0 }]
        },
        parentCommunity: { id: sub.id }
      });
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

  async publishItemPlaceholder(collectionId: string, title: string): Promise<string> {
    if (!(await this.isDspaceConfigured())) {
      return `dev-item-${randomUUID()}`;
    }
    try {
      const item = await this.dspaceRequest("POST", "/api/core/items", {
        name: title,
        inArchive: true,
        discoverable: true,
        withdrawn: false,
        metadata: {
          "dc.title": [{ value: title, language: null, authority: null, confidence: -1, place: 0 }]
        }
      });
      await this.dspaceRequest("POST", `/api/core/items/${item.id}/owningCollection`, {
        id: collectionId
      });
      return item.id;
    } catch (error) {
      this.logger.warn(`DSpace publish fallback: ${error instanceof Error ? error.message : error}`);
      return `dev-item-${randomUUID()}`;
    }
  }
}
