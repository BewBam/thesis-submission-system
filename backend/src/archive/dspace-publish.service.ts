import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";
import { DspaceProvisionerService } from "./dspace-provisioner.service";

@Injectable()
export class DspacePublishService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(DspacePublishService.name);

  constructor(private readonly dspaceProvisioner: DspaceProvisionerService) {}

  async publishApprovedSubmission(submissionId: string): Promise<{ dspaceItemId: string }> {
    const result = await this.db.query<{
      title: string;
      status: string;
      dspace_item_id: string | null;
      dspace_collection_id: string | null;
    }>(
      `SELECT COALESCE(NULLIF(s.title_en, ''), s.title) AS title,
              s.status,
              s.dspace_item_id,
              sem.dspace_collection_id
       FROM submissions s
       LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
       LEFT JOIN semesters sem ON sem.id = sp.semester_id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [submissionId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    if (row.status !== "approved" && row.status !== "archived") {
      return { dspaceItemId: row.dspace_item_id || "" };
    }
    if (row.dspace_item_id) {
      return { dspaceItemId: row.dspace_item_id };
    }
    if (!row.dspace_collection_id) {
      this.logger.warn(`Submission ${submissionId} has no DSpace collection; skipping publish`);
      return { dspaceItemId: "" };
    }

    const itemId = await this.dspaceProvisioner.publishItemPlaceholder(row.dspace_collection_id, row.title);
    await this.db.query(`UPDATE submissions SET dspace_item_id = $1 WHERE id = $2::uuid`, [itemId, submissionId]);
    return { dspaceItemId: itemId };
  }
}
