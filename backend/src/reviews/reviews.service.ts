import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DspacePublishService } from "../archive/dspace-publish.service";
import {
  THESIS_METADATA_GROUP_BY,
  THESIS_METADATA_SELECT
} from "../submissions/submission-metadata";
import { createPgPool } from "../users/db-pool";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ReviewActionDto } from "./dto/review-action.dto";

@Injectable()
export class ReviewsService {
  private readonly db = createPgPool();

  constructor(private readonly dspacePublishService: DspacePublishService) {}

  private libraryIntakeReadyClause() {
    return `s.status = 'reviewing'
      AND EXISTS (SELECT 1 FROM reviews r0 WHERE r0.submission_id = s.id)
      AND NOT EXISTS (
        SELECT 1 FROM reviews r1
        WHERE r1.submission_id = s.id AND r1.decision = 'pending'
      )
      AND NOT EXISTS (
        SELECT 1 FROM reviews r2
        WHERE r2.submission_id = s.id AND r2.decision = 'reject'
      )`;
  }

  async getMyQueue(user: JwtPayload) {
    if (user.role !== "reviewer") {
      throw new ForbiddenException();
    }

    const result = await this.db.query(
      `SELECT s.id,
              s.title,
              s.abstract,
              s.keywords,
              s.author,
              s.advisor,
              ${THESIS_METADATA_SELECT},
              s.student_id AS submitter_id,
              COALESCE(su.display_name, su.username) AS submitter,
              su.username AS submitter_username,
              s.status AS submission_status,
              s.created_at,
              r.decision AS my_decision,
              r.comment AS my_comment,
              r.decided_at AS my_decided_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', sf.id,
                    'fileName', sf.file_name,
                    'fileUrl', sf.file_url,
                    'fileType', sf.file_type
                  )
                ) FILTER (WHERE sf.id IS NOT NULL),
                '[]'::json
              ) AS files
       FROM reviews r
       JOIN submissions s ON s.id = r.submission_id
       LEFT JOIN users su ON su.id::text = s.student_id::text
       LEFT JOIN submission_files sf ON sf.submission_id = s.id
       WHERE r.reviewer_id = $1
       GROUP BY s.id,
                s.title,
                s.abstract,
                s.keywords,
                s.author,
                s.advisor,
                ${THESIS_METADATA_GROUP_BY},
                s.student_id,
                su.display_name,
                su.username,
                s.status,
                s.created_at,
                r.decision,
                r.comment,
                r.decided_at
       ORDER BY s.created_at DESC`,
      [user.sub]
    );

    return result.rows;
  }

  async act(user: JwtPayload, dto: ReviewActionDto) {
    if (user.role !== "reviewer") {
      throw new ForbiddenException();
    }
    if (dto.action === "archive") {
      throw new BadRequestException("Reviewers cannot archive submissions");
    }

    const assignment = await this.db.query(
      `SELECT r.decision, s.status AS submission_status
       FROM reviews r
       JOIN submissions s ON s.id = r.submission_id
       WHERE r.submission_id = $1 AND r.reviewer_id = $2
       LIMIT 1`,
      [dto.submissionId, user.sub]
    );
    const row = assignment.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not assigned to this reviewer");
    }
    if (row.decision !== "pending") {
      throw new BadRequestException("Review already completed");
    }
    if (row.submission_status !== "reviewing") {
      throw new BadRequestException("Submission is not in reviewer stage");
    }

    if (dto.action === "reject") {
      if (!dto.comment || !dto.comment.trim()) {
        throw new BadRequestException("Reject reason is required");
      }
    }

    const reviewDecision = dto.action === "approve" ? "approved" : "reject";

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE reviews
         SET status = $1,
             decision = $1,
             comment = $2,
             decided_at = NOW()
         WHERE submission_id = $3 AND reviewer_id = $4`,
        [reviewDecision, dto.action === "reject" ? dto.comment?.trim() || null : null, dto.submissionId, user.sub]
      );
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'reviewer', $4, $5::jsonb)`,
        [
          randomUUID(),
          dto.submissionId,
          user.sub,
          dto.action === "approve" ? "reviewer_approved" : "reviewer_rejected",
          JSON.stringify({
            comment: dto.action === "reject" ? dto.comment?.trim() || null : null
          })
        ]
      );

      if (dto.action === "reject") {
        await client.query(`UPDATE submissions SET status = 'rejected' WHERE id = $1`, [dto.submissionId]);
        await client.query(
          `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
           VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`,
          [
            randomUUID(),
            dto.submissionId,
            user.sub,
            JSON.stringify({
              from: row.submission_status,
              to: "rejected",
              reason: "reviewer_rejected"
            })
          ]
        );
      } else {
        const pending = await client.query(
          `SELECT COUNT(*)::int AS cnt
           FROM reviews
           WHERE submission_id = $1 AND decision = 'pending'`,
          [dto.submissionId]
        );
        const pendingCount = pending.rows[0]?.cnt ?? 0;
        if (pendingCount === 0) {
          await client.query(
            `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
             VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`,
            [
              randomUUID(),
              dto.submissionId,
              user.sub,
              JSON.stringify({
                from: row.submission_status,
                to: "reviewing",
                reason: "all_reviewers_approved"
              })
            ]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { ok: true };
  }

  private async getQueueRows(whereClause: string, params: unknown[] = []) {
    const result = await this.db.query(
      `SELECT s.id,
              s.title,
              s.abstract,
              s.keywords,
              s.author,
              s.advisor,
              ${THESIS_METADATA_SELECT},
              s.student_id AS submitter_id,
              COALESCE(su.display_name, su.username) AS submitter,
              su.username AS submitter_username,
              s.status AS submission_status,
              s.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', sf.id,
                    'fileName', sf.file_name,
                    'fileUrl', sf.file_url,
                    'fileType', sf.file_type
                  )
                ) FILTER (WHERE sf.id IS NOT NULL),
                '[]'::json
              ) AS files
       FROM submissions s
       LEFT JOIN users su ON su.id::text = s.student_id::text
       LEFT JOIN submission_files sf ON sf.submission_id = s.id
       WHERE ${whereClause}
       GROUP BY s.id,
                s.title,
                s.abstract,
                s.keywords,
                s.author,
                s.advisor,
                ${THESIS_METADATA_GROUP_BY},
                s.student_id,
                su.display_name,
                su.username,
                s.status,
                s.created_at
       ORDER BY s.created_at DESC`,
      params
    );
    return result.rows;
  }

  async getLibraryQueue(user: JwtPayload) {
    if (user.role !== "library_staff") {
      throw new ForbiddenException();
    }
    return this.getQueueRows(this.libraryIntakeReadyClause());
  }

  async getDirectorQueue(user: JwtPayload) {
    if (user.role !== "director") {
      throw new ForbiddenException();
    }
    return this.getQueueRows(`s.status = 'approved'`);
  }

  private async assertLibraryIntakeReady(submissionId: string) {
    const result = await this.db.query(
      `SELECT 1
       FROM submissions s
       WHERE s.id = $1::uuid AND ${this.libraryIntakeReadyClause()}
       LIMIT 1`,
      [submissionId]
    );
    if (!result.rows[0]) {
      throw new BadRequestException("Submission is not ready for library intake");
    }
  }

  async libraryAct(user: JwtPayload, dto: ReviewActionDto) {
    if (user.role !== "library_staff") {
      throw new ForbiddenException();
    }
    if (dto.action === "archive") {
      throw new BadRequestException("Library staff cannot archive submissions");
    }

    await this.assertLibraryIntakeReady(dto.submissionId);

    if (dto.action === "reject" && (!dto.comment || !dto.comment.trim())) {
      throw new BadRequestException("Reject reason is required");
    }

    const nextStatus = dto.action === "approve" ? "approved" : "rejected";
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: string }>(
        `SELECT status FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
        [dto.submissionId]
      );
      const row = current.rows[0];
      if (!row || row.status !== "reviewing") {
        throw new BadRequestException("Submission is not in reviewing stage");
      }

      await client.query(`UPDATE submissions SET status = $1 WHERE id = $2::uuid`, [nextStatus, dto.submissionId]);
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'library_staff', $4, $5::jsonb)`,
        [
          randomUUID(),
          dto.submissionId,
          user.sub,
          dto.action === "approve" ? "library_staff_approved" : "library_staff_rejected",
          JSON.stringify({
            comment: dto.action === "reject" ? dto.comment?.trim() || null : null
          })
        ]
      );
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`,
        [
          randomUUID(),
          dto.submissionId,
          user.sub,
          JSON.stringify({
            from: row.status,
            to: nextStatus,
            reason: dto.action === "approve" ? "library_staff_approved" : "library_staff_rejected"
          })
        ]
      );
      await client.query("COMMIT");

      if (dto.action === "approve") {
        try {
          await this.dspacePublishService.publishApprovedSubmission(dto.submissionId);
        } catch {
          // Publish failure must not roll back approval.
        }
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { ok: true };
  }

  async directorAct(user: JwtPayload, dto: ReviewActionDto) {
    if (user.role !== "director") {
      throw new ForbiddenException();
    }
    if (dto.action !== "archive") {
      throw new BadRequestException("Director can only archive approved submissions");
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ status: string }>(
        `SELECT status FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
        [dto.submissionId]
      );
      const row = current.rows[0];
      if (!row) {
        throw new NotFoundException("Submission not found");
      }
      if (row.status !== "approved") {
        throw new BadRequestException("Only approved submissions can be archived");
      }

      await client.query(`UPDATE submissions SET status = 'archived' WHERE id = $1::uuid`, [dto.submissionId]);
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'director', 'director_archived', $4::jsonb)`,
        [
          randomUUID(),
          dto.submissionId,
          user.sub,
          JSON.stringify({ comment: dto.comment?.trim() || null })
        ]
      );
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`,
        [
          randomUUID(),
          dto.submissionId,
          user.sub,
          JSON.stringify({
            from: row.status,
            to: "archived",
            reason: "director_archived"
          })
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { ok: true };
  }
}
