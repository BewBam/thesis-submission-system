"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const db_pool_1 = require("../users/db-pool");
let ReviewsService = class ReviewsService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
    }
    async getMyQueue(user) {
        if (user.role !== "reviewer") {
            throw new common_1.ForbiddenException();
        }
        const result = await this.db.query(`SELECT s.id,
              s.title,
              s.abstract,
              s.keywords,
              s.author,
              s.advisor,
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
                s.student_id,
                su.display_name,
                su.username,
                s.status,
                s.created_at,
                r.decision,
                r.comment,
                r.decided_at
       ORDER BY s.created_at DESC`, [user.sub]);
        return result.rows;
    }
    async act(user, dto) {
        if (user.role !== "reviewer") {
            throw new common_1.ForbiddenException();
        }
        const assignment = await this.db.query(`SELECT r.decision, s.status AS submission_status
       FROM reviews r
       JOIN submissions s ON s.id = r.submission_id
       WHERE r.submission_id = $1 AND r.reviewer_id = $2
       LIMIT 1`, [dto.submissionId, user.sub]);
        const row = assignment.rows[0];
        if (!row) {
            throw new common_1.NotFoundException("Submission not assigned to this reviewer");
        }
        if (row.decision !== "pending") {
            throw new common_1.BadRequestException("Review already completed");
        }
        if (row.submission_status !== "reviewing") {
            throw new common_1.BadRequestException("Submission is not in reviewer stage");
        }
        if (dto.action === "reject") {
            if (!dto.comment || !dto.comment.trim()) {
                throw new common_1.BadRequestException("Reject reason is required");
            }
        }
        const nextStatus = dto.action === "approve" ? "approved" : "reject";
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            await client.query(`UPDATE reviews
         SET status = $1,
             decision = $1,
             comment = $2,
             decided_at = NOW()
         WHERE submission_id = $3 AND reviewer_id = $4`, [nextStatus, dto.action === "reject" ? dto.comment?.trim() || null : null, dto.submissionId, user.sub]);
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'reviewer', $4, $5::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
                dto.submissionId,
                user.sub,
                dto.action === "approve" ? "reviewer_approved" : "reviewer_rejected",
                JSON.stringify({
                    comment: dto.action === "reject" ? dto.comment?.trim() || null : null
                })
            ]);
            if (dto.action === "reject") {
                await client.query(`UPDATE submissions SET status = 'reject' WHERE id = $1`, [dto.submissionId]);
                await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
           VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`, [
                    (0, node_crypto_1.randomUUID)(),
                    dto.submissionId,
                    user.sub,
                    JSON.stringify({
                        from: row.submission_status,
                        to: "reject",
                        reason: "reviewer_rejected"
                    })
                ]);
            }
            else {
                const pending = await client.query(`SELECT COUNT(*)::int AS cnt
           FROM reviews
           WHERE submission_id = $1 AND decision = 'pending'`, [dto.submissionId]);
                const pendingCount = pending.rows[0]?.cnt ?? 0;
                if (pendingCount === 0) {
                    await client.query(`UPDATE submissions SET status = 'approving' WHERE id = $1`, [dto.submissionId]);
                    await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
             VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`, [
                        (0, node_crypto_1.randomUUID)(),
                        dto.submissionId,
                        user.sub,
                        JSON.stringify({
                            from: row.submission_status,
                            to: "approving",
                            reason: "all_reviewers_approved"
                        })
                    ]);
                }
            }
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
        return { ok: true };
    }
    async getAdminQueue(user) {
        if (user.role !== "admin") {
            throw new common_1.ForbiddenException();
        }
        const result = await this.db.query(`SELECT s.id,
              s.title,
              s.abstract,
              s.keywords,
              s.author,
              s.advisor,
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
       LEFT JOIN submission_files sf ON sf.submission_id = s.id
       WHERE s.status = 'approving'
       GROUP BY s.id, s.title, s.abstract, s.keywords, s.author, s.advisor, s.status, s.created_at
       ORDER BY s.created_at DESC`);
        return result.rows;
    }
    async adminAct(user, dto) {
        if (user.role !== "admin") {
            throw new common_1.ForbiddenException();
        }
        if (dto.action === "reject" && (!dto.comment || !dto.comment.trim())) {
            throw new common_1.BadRequestException("Reject reason is required");
        }
        const current = await this.db.query(`SELECT status FROM submissions WHERE id = $1 LIMIT 1`, [dto.submissionId]);
        const row = current.rows[0];
        if (!row) {
            throw new common_1.NotFoundException("Submission not found");
        }
        if (row.status !== "approving") {
            throw new common_1.BadRequestException("Submission is not in admin approval stage");
        }
        const nextStatus = dto.action === "approve" ? "approved" : "reject";
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            await client.query(`UPDATE submissions SET status = $1 WHERE id = $2`, [nextStatus, dto.submissionId]);
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'admin', $4, $5::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
                dto.submissionId,
                user.sub,
                dto.action === "approve" ? "admin_approved" : "admin_rejected",
                JSON.stringify({
                    comment: dto.action === "reject" ? dto.comment?.trim() || null : null
                })
            ]);
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
                dto.submissionId,
                user.sub,
                JSON.stringify({
                    from: row.status,
                    to: nextStatus,
                    reason: dto.action === "approve" ? "admin_final_approval" : "admin_rejected"
                })
            ]);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
        return { ok: true };
    }
};
exports.ReviewsService = ReviewsService;
exports.ReviewsService = ReviewsService = __decorate([
    (0, common_1.Injectable)()
], ReviewsService);
//# sourceMappingURL=reviews.service.js.map