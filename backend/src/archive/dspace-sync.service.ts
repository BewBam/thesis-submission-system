import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";
import { DspaceProvisionerService } from "./dspace-provisioner.service";

export type DspaceSyncNode = {
  dspaceId: string;
  name: string;
  type: "community" | "collection";
  parentDspaceId: string | null;
  depth: number;
  path: string;
  rootCommunityId: string;
  browseUrl?: string;
};

export type DspaceSyncResult = {
  rootCommunityId: string | null;
  matchedFaculties: [];
  matchedSemesters: [];
  matchedPeriods: [];
  unmatched: [];
  nodes: DspaceSyncNode[];
  stats: {
    total: number;
    communities: number;
    collections: number;
  };
};

/**
 * Portal keeps its own faculty / semester / period structure.
 * Sync only indexes the real DSpace tree into a dynamic table and does not
 * force DSpace nodes into the portal hierarchy.
 */
@Injectable()
export class DspaceSyncService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(DspaceSyncService.name);

  constructor(private readonly dspaceProvisioner: DspaceProvisionerService) {}

  async syncFromRootCommunity(): Promise<DspaceSyncResult> {
    await this.dspaceProvisioner.assertConfigured();
    const configuredRootId = (await this.dspaceProvisioner.getRootCommunityId()).trim();
    let nodes: DspaceSyncNode[] = [];
    let usedRootId: string | null = configuredRootId || null;

    if (configuredRootId) {
      try {
        nodes = await this.collectNodes(configuredRootId, configuredRootId, "", 0);
      } catch (error) {
        this.logger.warn(
          `Sync under configured root ${configuredRootId} failed; falling back to top-level: ${
            error instanceof Error ? error.message : error
          }`
        );
        nodes = [];
      }
      if (nodes.length === 0) {
        this.logger.warn(
          `No DSpace nodes under configured root ${configuredRootId}; falling back to top-level communities`
        );
        usedRootId = null;
      } else {
        await this.persistNodes([configuredRootId], nodes, false);
      }
    }

    if (!usedRootId) {
      const topLevelCommunities = await this.listTopLevelCommunities();
      if (topLevelCommunities.length === 0) {
        throw new BadRequestException(
          "DSpace returned no top-level communities. Check API credentials and that communities exist (try /api/core/communities/search/top in HAL browser)."
        );
      }
      nodes = [];
      for (const community of topLevelCommunities) {
        nodes.push({
          dspaceId: community.id,
          name: community.name,
          type: "community",
          parentDspaceId: null,
          depth: 0,
          path: community.name,
          rootCommunityId: community.id
        });
        nodes.push(...(await this.collectNodes(community.id, community.id, community.name, 1)));
      }
      await this.persistNodes(
        topLevelCommunities.map((community) => community.id),
        nodes,
        true
      );
    }

    const linkedNodes = await this.withBrowseUrls(nodes);
    return {
      rootCommunityId: usedRootId,
      matchedFaculties: [],
      matchedSemesters: [],
      matchedPeriods: [],
      unmatched: [],
      nodes: linkedNodes,
      stats: {
        total: linkedNodes.length,
        communities: linkedNodes.filter((node) => node.type === "community").length,
        collections: linkedNodes.filter((node) => node.type === "collection").length
      }
    };
  }

  private async withBrowseUrls(nodes: DspaceSyncNode[]): Promise<DspaceSyncNode[]> {
    const uiBase = await this.dspaceProvisioner.getUiBaseUrl();
    if (!uiBase) {
      return nodes;
    }
    return nodes.map((node) =>
      node.type === "collection"
        ? { ...node, browseUrl: `${uiBase}/collections/${node.dspaceId}` }
        : node
    );
  }

  private async listTopLevelCommunities(): Promise<Array<{ id: string; name: string }>> {
    try {
      return (await this.dspaceProvisioner.listTopLevelCommunities()).sort((a, b) =>
        a.name.localeCompare(b.name, "vi")
      );
    } catch (error) {
      this.logger.error(
        `Failed to list top-level DSpace communities: ${error instanceof Error ? error.message : error}`
      );
      throw new BadRequestException(
        `Unable to list top-level DSpace communities: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  async listSyncedNodes(rootCommunityId?: string): Promise<DspaceSyncNode[]> {
    const params: string[] = [];
    let whereClause = "WHERE is_active = TRUE";
    if (rootCommunityId?.trim()) {
      params.push(rootCommunityId.trim());
      whereClause += ` AND root_community_id = $${params.length}`;
    }
    const result = await this.db.query<{
      dspace_id: string;
      name: string;
      node_type: "community" | "collection";
      parent_dspace_id: string | null;
      depth: number;
      path: string;
      root_community_id: string;
    }>(
      `SELECT dspace_id, name, node_type, parent_dspace_id, depth, path, root_community_id
       FROM dspace_sync_nodes
       ${whereClause}
       ORDER BY depth ASC, path ASC, name ASC`,
      params
    );
    return this.withBrowseUrls(
      result.rows.map((row) => ({
        dspaceId: row.dspace_id,
        name: row.name,
        type: row.node_type,
        parentDspaceId: row.parent_dspace_id,
        depth: row.depth,
        path: row.path,
        rootCommunityId: row.root_community_id
      }))
    );
  }

  private async collectNodes(
    rootCommunityId: string,
    communityId: string,
    parentPath: string,
    depth: number
  ): Promise<DspaceSyncNode[]> {
    let communities: Array<{ id: string; name: string }> = [];
    let collections: Array<{ id: string; name: string }> = [];
    try {
      [communities, collections] = await Promise.all([
        this.dspaceProvisioner.listSubcommunities(communityId),
        this.dspaceProvisioner.listCollections(communityId)
      ]);
    } catch (error) {
      this.logger.error(`Failed to list DSpace children for community ${communityId}`, error);
      throw new BadRequestException(
        `Unable to list DSpace children for ${communityId}: ${error instanceof Error ? error.message : error}`
      );
    }

    const nodes: DspaceSyncNode[] = [];
    for (const community of communities.sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
      const path = parentPath ? `${parentPath} / ${community.name}` : community.name;
      nodes.push({
        dspaceId: community.id,
        name: community.name,
        type: "community",
        parentDspaceId: communityId,
        depth,
        path,
        rootCommunityId
      });
      const descendants = await this.collectNodes(rootCommunityId, community.id, path, depth + 1);
      nodes.push(...descendants);
    }

    for (const collection of collections.sort((a, b) => a.name.localeCompare(b.name, "vi"))) {
      const path = parentPath ? `${parentPath} / ${collection.name}` : collection.name;
      nodes.push({
        dspaceId: collection.id,
        name: collection.name,
        type: "collection",
        parentDspaceId: communityId,
        depth,
        path,
        rootCommunityId
      });
    }

    return nodes;
  }

  private async persistNodes(
    rootCommunityIds: string[],
    nodes: DspaceSyncNode[],
    clearAll: boolean
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      if (clearAll) {
        await client.query(`UPDATE dspace_sync_nodes SET is_active = FALSE`);
      } else if (rootCommunityIds.length > 0) {
        await client.query(`UPDATE dspace_sync_nodes SET is_active = FALSE WHERE root_community_id = ANY($1)`, [
          rootCommunityIds
        ]);
      }
      for (const node of nodes) {
        await client.query(
          `INSERT INTO dspace_sync_nodes (
             dspace_id, root_community_id, parent_dspace_id, node_type, name, depth, path, is_active, last_synced_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())
           ON CONFLICT (dspace_id) DO UPDATE
           SET root_community_id = EXCLUDED.root_community_id,
               parent_dspace_id = EXCLUDED.parent_dspace_id,
               node_type = EXCLUDED.node_type,
               name = EXCLUDED.name,
               depth = EXCLUDED.depth,
               path = EXCLUDED.path,
               is_active = TRUE,
               last_synced_at = NOW()`,
          [
            node.dspaceId,
            node.rootCommunityId,
            node.parentDspaceId,
            node.type,
            node.name,
            node.depth,
            node.path
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
