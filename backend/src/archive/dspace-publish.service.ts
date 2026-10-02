import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";
import { SubmissionFormFieldsService } from "../submissions/submission-form-fields.service";
import { DspaceProvisionerService } from "./dspace-provisioner.service";

export type DspacePublishResult = {
  dspaceItemId: string;
  mode: "dspace" | "dev" | "skipped";
  bitstreamUploaded: boolean;
  collectionId: string | null;
  message?: string;
};

export type DspacePublishQueueItem = {
  id: string;
  title: string;
  author: string;
  status: string;
  dspacePublishStatus: string;
  dspaceItemId: string | null;
  facultyId: string | null;
  facultyName: string | null;
  semesterId: string | null;
  semesterCode: string | null;
  semesterName: string | null;
  periodId: string | null;
  periodName: string | null;
  periodCollectionId: string | null;
  createdAt: string;
};

@Injectable()
export class DspacePublishService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(DspacePublishService.name);

  constructor(
    private readonly dspaceProvisioner: DspaceProvisionerService,
    private readonly formFieldsService: SubmissionFormFieldsService
  ) {}

  async listPublishQueue(filters: {
    facultyId?: string;
    semesterId?: string;
    periodId?: string;
    dspaceStatus?: string;
  }): Promise<DspacePublishQueueItem[]> {
    const params: unknown[] = [];
    const where: string[] = [`s.status = 'archived'`];

    if (filters.facultyId?.trim()) {
      params.push(filters.facultyId.trim());
      where.push(`sem.faculty_id = $${params.length}::uuid`);
    }
    if (filters.semesterId?.trim()) {
      params.push(filters.semesterId.trim());
      where.push(`sp.semester_id = $${params.length}::uuid`);
    }
    if (filters.periodId?.trim()) {
      params.push(filters.periodId.trim());
      where.push(`sp.id = $${params.length}::uuid`);
    }
    if (filters.dspaceStatus?.trim()) {
      params.push(filters.dspaceStatus.trim());
      where.push(`COALESCE(s.dspace_publish_status, 'pending') = $${params.length}`);
    }

    const result = await this.db.query<{
      id: string;
      title: string;
      author: string;
      status: string;
      dspace_publish_status: string;
      dspace_item_id: string | null;
      faculty_id: string | null;
      faculty_name: string | null;
      semester_id: string | null;
      semester_name: string | null;
      period_id: string | null;
      period_name: string | null;
      period_collection_id: string | null;
      created_at: string;
    }>(
      `SELECT s.id::text AS id,
              COALESCE(NULLIF(s.title_en, ''), s.title) AS title,
              s.author,
              s.status,
              COALESCE(s.dspace_publish_status, 'pending') AS dspace_publish_status,
              s.dspace_item_id,
              f.id::text AS faculty_id,
              f.name AS faculty_name,
              sem.id::text AS semester_id,
              sem.name AS semester_name,
              sp.id::text AS period_id,
              sp.name AS period_name,
              sp.dspace_collection_id AS period_collection_id,
              s.created_at
       FROM submissions s
       LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
       LEFT JOIN semesters sem ON sem.id = sp.semester_id
       LEFT JOIN faculties f ON f.id = sem.faculty_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.created_at DESC`,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      status: row.status,
      dspacePublishStatus: row.dspace_publish_status,
      dspaceItemId: row.dspace_item_id,
      facultyId: row.faculty_id,
      facultyName: row.faculty_name,
      semesterId: row.semester_id,
      semesterCode: row.semester_name,
      semesterName: row.semester_name,
      periodId: row.period_id,
      periodName: row.period_name,
      periodCollectionId: row.period_collection_id,
      createdAt: row.created_at
    }));
  }

  async publishSubmissionsToCollection(input: {
    submissionIds: string[];
    collectionId: string;
  }): Promise<{
    results: Array<{
      submissionId: string;
      ok: boolean;
      dspaceItemId?: string;
      bitstreamUploaded?: boolean;
      message: string;
    }>;
  }> {
    const collectionId = input.collectionId?.trim();
    if (!collectionId) {
      throw new BadRequestException("collectionId is required");
    }
    const ids = (input.submissionIds || []).map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      throw new BadRequestException("submissionIds is required");
    }

    const collectionOk = await this.db.query(
      `SELECT 1 FROM dspace_sync_nodes
       WHERE dspace_id = $1 AND node_type = 'collection' AND is_active = TRUE
       LIMIT 1`,
      [collectionId]
    );
    if (!collectionOk.rows[0]) {
      // Still allow publish to a known period collection or any UUID the admin typed from sync tree.
      this.logger.warn(
        `Collection ${collectionId} not found in dspace_sync_nodes — continuing with provided id`
      );
    }

    const results: Array<{
      submissionId: string;
      ok: boolean;
      dspaceItemId?: string;
      bitstreamUploaded?: boolean;
      message: string;
    }> = [];

    this.logger.log(
      `Push to DSpace started: ${ids.length} submission(s), collection ${collectionId}`
    );

    for (const submissionId of ids) {
      this.logger.log(`Push to DSpace: submission ${submissionId} → collection ${collectionId}`);
      try {
        const published = await this.publishApprovedSubmission(submissionId, collectionId);
        const ok = Boolean(published.dspaceItemId) && published.mode !== "skipped";
        if (ok) {
          this.logger.log(
            `Push to DSpace succeeded: submission ${submissionId}, item ${published.dspaceItemId}, pdf ${published.bitstreamUploaded ? "uploaded" : "not uploaded"}`
          );
        } else {
          this.logger.warn(
            `Push to DSpace did not publish submission ${submissionId}: ${published.message || published.mode}. DSpace status left pending.`
          );
        }
        results.push({
          submissionId,
          ok,
          dspaceItemId: published.dspaceItemId || undefined,
          bitstreamUploaded: published.bitstreamUploaded,
          message: published.message || (ok ? "Published" : "Skipped")
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Push to DSpace failed: submission ${submissionId}, collection ${collectionId}: ${message}`
        );
        await this.markPublishStatus(submissionId, "pending", null);
        results.push({ submissionId, ok: false, message });
      }
    }

    const okCount = results.filter((row) => row.ok).length;
    this.logger.log(
      `Push to DSpace finished: ${okCount} published, ${results.length - okCount} not published (status stays pending)`
    );

    return { results };
  }

  async publishApprovedSubmission(
    submissionId: string,
    collectionIdOverride?: string
  ): Promise<DspacePublishResult> {
    const result = await this.db.query<{
      title: string;
      abstract: string | null;
      author: string | null;
      status: string;
      dspace_item_id: string | null;
      dspace_collection_id: string | null;
      thesis_file_url: string | null;
      thesis_file_name: string | null;
      date_issued: string | null;
      publisher: string | null;
      document_type: string | null;
      language: string | null;
      description: string | null;
      thesis_year: string | null;
      university_name: string | null;
      thesis_advisors: string | null;
      major: string | null;
      extra_metadata: unknown;
    }>(
      `SELECT COALESCE(NULLIF(s.title_en, ''), s.title) AS title,
              s.abstract,
              s.author,
              s.status,
              s.dspace_item_id,
              sp.dspace_collection_id AS dspace_collection_id,
              s.date_issued,
              s.publisher,
              s.document_type,
              s.language,
              s.description,
              s.thesis_year,
              s.university_name,
              s.thesis_advisors,
              s.major,
              s.extra_metadata,
              (
                SELECT sf.file_url
                FROM submission_files sf
                WHERE sf.submission_id = s.id AND sf.file_type = 'thesis'
                LIMIT 1
              ) AS thesis_file_url,
              (
                SELECT sf.file_name
                FROM submission_files sf
                WHERE sf.submission_id = s.id AND sf.file_type = 'thesis'
                LIMIT 1
              ) AS thesis_file_name
       FROM submissions s
       LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [submissionId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    if (row.status !== "approved" && row.status !== "archived") {
      return {
        dspaceItemId: row.dspace_item_id || "",
        mode: "skipped",
        bitstreamUploaded: false,
        collectionId: row.dspace_collection_id,
        message: `Skip publish for status ${row.status}`
      };
    }

    const targetCollectionId = (collectionIdOverride || row.dspace_collection_id || "").trim() || null;

    if (row.dspace_item_id && !row.dspace_item_id.startsWith("dev-item-")) {
      if (row.thesis_file_url) {
        try {
          const uploaded = await this.dspaceProvisioner.uploadThesisPdfToItem(
            row.dspace_item_id,
            row.thesis_file_url,
            row.thesis_file_name
          );
          await this.markPublishStatus(submissionId, "published", row.dspace_item_id);
          return {
            dspaceItemId: row.dspace_item_id,
            mode: "dspace",
            bitstreamUploaded: uploaded,
            collectionId: targetCollectionId,
            message: uploaded
              ? "Uploaded thesis PDF to existing DSpace item"
              : "DSpace item exists but PDF upload failed — check logs"
          };
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Push to DSpace PDF upload failed: submission ${submissionId}, item ${row.dspace_item_id}: ${detail}. DSpace status left pending.`
          );
          await this.markPublishStatus(submissionId, "pending", row.dspace_item_id);
          return {
            dspaceItemId: row.dspace_item_id,
            mode: "dspace",
            bitstreamUploaded: false,
            collectionId: targetCollectionId,
            message: "DSpace item exists but PDF upload failed — check logs"
          };
        }
      }
      await this.markPublishStatus(submissionId, "published", row.dspace_item_id);
      return {
        dspaceItemId: row.dspace_item_id,
        mode: "dspace",
        bitstreamUploaded: false,
        collectionId: targetCollectionId,
        message: "Already published"
      };
    }

    if (!targetCollectionId) {
      this.logger.warn(`Submission ${submissionId} has no DSpace collection; skipping publish`);
      return {
        dspaceItemId: "",
        mode: "skipped",
        bitstreamUploaded: false,
        collectionId: null,
        message: "No DSpace collection selected — pick a synced collection before pushing"
      };
    }

    const authors = String(row.author || "")
      .split(/[;|]/)
      .map((part) => part.trim())
      .filter(Boolean);

    try {
      const dspaceMetadata = await this.formFieldsService.buildDspaceMetadata({
        ...row,
        extra_metadata: this.parseExtra(row.extra_metadata)
      });
      const published = await this.dspaceProvisioner.publishArchivedItem({
        collectionId: targetCollectionId,
        title: row.title,
        authors,
        metadata: dspaceMetadata,
        pdfPath: row.thesis_file_url,
        pdfFileName: row.thesis_file_name
      });

      const publishedForReal =
        published.mode === "dspace" && Boolean(published.id) && !published.id.startsWith("dev-item-");
      const status = publishedForReal ? "published" : "pending";
      if (!publishedForReal) {
        this.logger.warn(
          `Push to DSpace did not create a real item for submission ${submissionId} (mode ${published.mode}, id ${published.id || "none"}). DSpace status left pending.`
        );
      }
      await this.markPublishStatus(submissionId, status, published.id);

      return {
        dspaceItemId: published.id,
        mode: published.mode,
        bitstreamUploaded: published.bitstreamUploaded,
        collectionId: targetCollectionId,
        message:
          published.mode === "dev"
            ? "DSpace not configured — stored local placeholder item id"
            : published.bitstreamUploaded
              ? "Published item and thesis PDF to DSpace"
              : "Published item metadata to DSpace (PDF missing or upload failed — check logs)"
      };
    } catch (error) {
      await this.markPublishStatus(submissionId, "pending", null);
      throw error;
    }
  }

  private async markPublishStatus(
    submissionId: string,
    status: "pending" | "published" | "failed",
    dspaceItemId: string | null
  ) {
    if (dspaceItemId) {
      await this.db.query(
        `UPDATE submissions
         SET dspace_item_id = $1, dspace_publish_status = $2
         WHERE id = $3::uuid`,
        [dspaceItemId, status, submissionId]
      );
      return;
    }
    await this.db.query(
      `UPDATE submissions SET dspace_publish_status = $1 WHERE id = $2::uuid`,
      [status, submissionId]
    );
  }

  private parseExtra(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    return raw as Record<string, unknown>;
  }
}
