import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { DatabaseError } from "pg";
import type { JwtPayload } from "../auth/jwt.strategy";
import { UsersService } from "../users/users.service";
import { createPgPool } from "../users/db-pool";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { ResubmitSubmissionDto } from "./dto/resubmit-submission.dto";

const uploadsRoot = path.join(process.cwd(), "uploads", "submissions");
const acceptedPdfMimeTypes = ["application/pdf"];
const acceptedAttachmentMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg"
];

type UploadedFile = {
  originalname: string;
  mimetype: string;
  path: string;
  filename: string;
};

@Injectable()
export class SubmissionsService {
  private readonly db = createPgPool();

  constructor(private readonly usersService: UsersService) {}

  async createSubmission(
    actor: JwtPayload,
    dto: CreateSubmissionDto,
    thesisFile: UploadedFile | undefined,
    attachments: UploadedFile[]
  ) {
    if (actor.role !== "student") {
      throw new BadRequestException("Only students can submit theses");
    }
    if (!thesisFile) {
      throw new BadRequestException("Thesis PDF is required");
    }
    if (!acceptedPdfMimeTypes.includes(thesisFile.mimetype)) {
      throw new BadRequestException("Thesis file must be a PDF");
    }

    for (const attachment of attachments) {
      if (!acceptedAttachmentMimeTypes.includes(attachment.mimetype)) {
        throw new BadRequestException(`Unsupported attachment format: ${attachment.originalname}`);
      }
    }

    const student = await this.usersService.findById(dto.studentId);
    if (!student || student.role !== "student") {
      throw new BadRequestException("Invalid student account");
    }

    const uniqueAuthorIds = Array.from(new Set(dto.authorIds));
    if (uniqueAuthorIds.length === 0) {
      throw new BadRequestException("At least one author is required");
    }

    const authorUsers = [];
    for (const authorId of uniqueAuthorIds) {
      const authorUser = await this.usersService.findById(authorId);
      if (!authorUser || authorUser.role !== "student") {
        throw new BadRequestException("Invalid author account");
      }
      authorUsers.push(authorUser);
    }

    if (!uniqueAuthorIds.includes(dto.studentId)) {
      throw new BadRequestException("Submitting student must be included in authors");
    }

    const authorSnapshot = authorUsers.map((user) => user.displayName || user.username).join("; ");

    const uniqueReviewerIds = Array.from(new Set(dto.reviewerIds));
    if (uniqueReviewerIds.length === 0) {
      throw new BadRequestException("At least one reviewer is required");
    }

    const reviewerUsers = [];
    for (const reviewerId of uniqueReviewerIds) {
      const reviewerUser = await this.usersService.findById(reviewerId);
      if (!reviewerUser || reviewerUser.role !== "reviewer") {
        throw new BadRequestException("Invalid reviewer account");
      }
      reviewerUsers.push(reviewerUser);
    }

    const advisorSnapshot = reviewerUsers.map((user) => user.displayName || user.username).join("; ");

    const submissionId = randomUUID();
    const targetDirectory = path.join(uploadsRoot, submissionId);
    await mkdir(targetDirectory, { recursive: true });

    const savedFiles = [];
    const thesisFilePath = await this.moveUploadedFile(thesisFile, targetDirectory);
    savedFiles.push({
      id: randomUUID(),
      submission_id: submissionId,
      file_name: thesisFile.originalname,
      file_url: thesisFilePath,
      file_type: "thesis"
    });

    for (const attachment of attachments) {
      const attachmentPath = await this.moveUploadedFile(attachment, targetDirectory);
      savedFiles.push({
        id: randomUUID(),
        submission_id: submissionId,
        file_name: attachment.originalname,
        file_url: attachmentPath,
        file_type: "attachment"
      });
    }

    try {
      const client = await this.db.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO submissions (id, title, author, advisor, abstract, keywords, student_id, advisor_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'reviewing')`,
          [submissionId, dto.title, authorSnapshot, advisorSnapshot, dto.abstract, dto.keywords, dto.studentId]
        );
        await client.query(
          `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
           VALUES ($1, $2, $3, 'student', 'submitted', $4::jsonb)`,
          [
            randomUUID(),
            submissionId,
            actor.sub,
            JSON.stringify({
              title: dto.title,
              authorIds: uniqueAuthorIds,
              reviewerIds: uniqueReviewerIds
            })
          ]
        );

        let sortOrder = 0;
        for (const authorId of uniqueAuthorIds) {
          await client.query(
            `INSERT INTO submission_authors (submission_id, user_id, sort_order)
             VALUES ($1, $2, $3)`,
            [submissionId, authorId, sortOrder]
          );
          sortOrder += 1;
        }

        sortOrder = 0;
        for (const reviewerId of uniqueReviewerIds) {
          await client.query(
            `INSERT INTO submission_reviewers (submission_id, user_id, sort_order)
             VALUES ($1, $2, $3)`,
            [submissionId, reviewerId, sortOrder]
          );
          sortOrder += 1;
        }

        for (const reviewerId of uniqueReviewerIds) {
          await client.query(
            `INSERT INTO reviews (id, submission_id, reviewer_id, status, decision, comment)
             VALUES ($1, $2, $3, 'pending', 'pending', NULL)`,
            [randomUUID(), submissionId, reviewerId]
          );
        }

        for (const file of savedFiles) {
          await client.query(
            `INSERT INTO submission_files (id, submission_id, file_name, file_url, file_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [file.id, file.submission_id, file.file_name, file.file_url, file.file_type]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const message =
        error instanceof DatabaseError
          ? `${error.message} (code=${error.code})`
          : error instanceof Error
            ? error.message
            : "Unknown error";
      throw new InternalServerErrorException(
        `Unable to store submission: ${message}`
      );
    }

    return {
      id: submissionId,
      status: "reviewing"
    };
  }

  async getStudentSubmissions(studentId: string) {
    const result = await this.db.query(
      `SELECT s.id,
              s.title,
              COALESCE((
                SELECT string_agg(u.display_name, '; ' ORDER BY sa.sort_order)
                FROM submission_authors sa
                JOIN users u ON u.id = sa.user_id
                WHERE sa.submission_id = s.id
              ), s.author) AS author,
              COALESCE((
                SELECT string_agg(rv.display_name, '; ' ORDER BY sr.sort_order)
                FROM submission_reviewers sr
                JOIN users rv ON rv.id = sr.user_id
                WHERE sr.submission_id = s.id
              ), s.advisor) AS advisor,
              s.abstract,
              s.keywords,
              s.status,
              s.created_at,
              s.student_id AS submitter_id,
              COALESCE(su.display_name, su.username) AS submitter,
              su.username AS submitter_username,
              (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'reviewerId', r2.reviewer_id,
                      'reviewer', COALESCE(u2.display_name, u2.username),
                      'username', u2.username,
                      'decision', r2.decision,
                      'status', r2.status,
                      'comment', r2.comment,
                      'decidedAt', r2.decided_at
                    )
                    ORDER BY COALESCE(u2.display_name, u2.username)
                  ),
                  '[]'::json
                )
                FROM reviews r2
                JOIN users u2 ON u2.id::text = r2.reviewer_id::text
                WHERE r2.submission_id = s.id
              ) AS reviews,
              (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ev.id,
                      'eventType', ev.event_type,
                      'actorId', ev.actor_id,
                      'actorRole', ev.actor_role,
                      'actorName', COALESCE(u3.display_name, u3.username),
                      'payload', ev.payload,
                      'createdAt', ev.created_at
                    )
                    ORDER BY ev.created_at ASC
                  ),
                  '[]'::json
                )
                FROM submission_events ev
                LEFT JOIN users u3 ON u3.id::text = ev.actor_id::text
                WHERE ev.submission_id = s.id
              ) AS workflow_history,
              COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'id', sf.id,
                    'fileName', sf.file_name,
                    'fileUrl', sf.file_url,
                    'fileType', sf.file_type
                  )
                  ORDER BY sf.file_type, sf.file_name
                )
                FROM submission_files sf
                WHERE sf.submission_id = s.id
              ), '[]'::json) AS files
       FROM submissions s
       LEFT JOIN users su ON su.id::text = s.student_id::text
       WHERE s.student_id = $1::text
          OR EXISTS (
            SELECT 1 FROM submission_authors sa_vis
            WHERE sa_vis.submission_id = s.id AND sa_vis.user_id = $2::uuid
          )
       ORDER BY s.created_at DESC`,
      [studentId, studentId]
    );

    return result.rows;
  }

  async getAllSubmissions() {
    const result = await this.db.query(
      `SELECT s.id,
              s.title,
              COALESCE((
                SELECT string_agg(u.display_name, '; ' ORDER BY sa.sort_order)
                FROM submission_authors sa
                JOIN users u ON u.id = sa.user_id
                WHERE sa.submission_id = s.id
              ), s.author) AS author,
              COALESCE((
                SELECT string_agg(rv.display_name, '; ' ORDER BY sr.sort_order)
                FROM submission_reviewers sr
                JOIN users rv ON rv.id = sr.user_id
                WHERE sr.submission_id = s.id
              ), s.advisor) AS advisor,
              s.abstract,
              s.keywords,
              s.status,
              s.created_at,
              s.student_id AS submitter_id,
              COALESCE(su.display_name, su.username) AS submitter,
              su.username AS submitter_username,
              s.author AS author_snapshot,
              s.advisor AS advisor_snapshot,
              s.dspace_item_id,
              (
                SELECT COALESCE(
                  json_agg(sa2.user_id::text ORDER BY sa2.sort_order),
                  '[]'::json
                )
                FROM submission_authors sa2
                WHERE sa2.submission_id = s.id
              ) AS author_user_ids,
              (
                SELECT COALESCE(
                  json_agg(sr2.user_id::text ORDER BY sr2.sort_order),
                  '[]'::json
                )
                FROM submission_reviewers sr2
                WHERE sr2.submission_id = s.id
              ) AS reviewer_user_ids,
              (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'reviewerId', r2.reviewer_id,
                      'reviewer', COALESCE(u2.display_name, u2.username),
                      'username', u2.username,
                      'decision', r2.decision,
                      'status', r2.status,
                      'comment', r2.comment,
                      'decidedAt', r2.decided_at
                    )
                    ORDER BY COALESCE(u2.display_name, u2.username)
                  ),
                  '[]'::json
                )
                FROM reviews r2
                JOIN users u2 ON u2.id::text = r2.reviewer_id::text
                WHERE r2.submission_id = s.id
              ) AS reviews,
              (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ev.id,
                      'eventType', ev.event_type,
                      'actorId', ev.actor_id,
                      'actorRole', ev.actor_role,
                      'actorName', COALESCE(u3.display_name, u3.username),
                      'payload', ev.payload,
                      'createdAt', ev.created_at
                    )
                    ORDER BY ev.created_at ASC
                  ),
                  '[]'::json
                )
                FROM submission_events ev
                LEFT JOIN users u3 ON u3.id::text = ev.actor_id::text
                WHERE ev.submission_id = s.id
              ) AS workflow_history,
              COALESCE((
                SELECT json_agg(
                  json_build_object(
                    'id', sf.id,
                    'fileName', sf.file_name,
                    'fileUrl', sf.file_url,
                    'fileType', sf.file_type
                  )
                  ORDER BY sf.file_type, sf.file_name
                )
                FROM submission_files sf
                WHERE sf.submission_id = s.id
              ), '[]'::json) AS files
       FROM submissions s
       LEFT JOIN users su ON su.id::text = s.student_id::text
       ORDER BY s.created_at DESC`
    );

    return result.rows;
  }

  async resubmitSubmission(
    actor: JwtPayload,
    submissionId: string,
    dto: ResubmitSubmissionDto,
    thesisFile: UploadedFile | undefined,
    attachments: UploadedFile[]
  ) {
    if (actor.role !== "student") {
      throw new ForbiddenException();
    }

    const normalizedTitle = dto.title?.trim();
    const normalizedAbstract = dto.abstract?.trim();
    const normalizedKeywords = dto.keywords?.trim();
    const hasMetadataUpdate = Boolean(normalizedTitle || normalizedAbstract || normalizedKeywords);
    const hasFileUpdate = Boolean(thesisFile || attachments.length > 0);
    if (!hasMetadataUpdate && !hasFileUpdate) {
      throw new BadRequestException("Please update metadata or upload files before resubmitting");
    }

    if (thesisFile && !acceptedPdfMimeTypes.includes(thesisFile.mimetype)) {
      throw new BadRequestException("Thesis file must be a PDF");
    }
    for (const attachment of attachments) {
      if (!acceptedAttachmentMimeTypes.includes(attachment.mimetype)) {
        throw new BadRequestException(`Unsupported attachment format: ${attachment.originalname}`);
      }
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        title: string;
        abstract: string;
        keywords: string;
        student_id: string;
        status: string;
      }>(
        `SELECT title, abstract, keywords, student_id, status
         FROM submissions
         WHERE id = $1::uuid
         LIMIT 1
         FOR UPDATE`,
        [submissionId]
      );
      const row = existing.rows[0];
      if (!row) {
        throw new NotFoundException("Submission not found");
      }
      if (row.student_id !== actor.sub) {
        throw new ForbiddenException("Students can only resubmit their own thesis");
      }
      if (row.status !== "reject") {
        throw new BadRequestException("Only rejected theses can be resubmitted");
      }

      const reviewSummary = await client.query<{ total: number; approved: number; pending: number; rejected: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE decision = 'approved')::int AS approved,
                COUNT(*) FILTER (WHERE decision = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE decision = 'reject')::int AS rejected
         FROM reviews
         WHERE submission_id = $1::uuid`,
        [submissionId]
      );
      const reviewInfo = reviewSummary.rows[0] ?? { total: 0, approved: 0, pending: 0, rejected: 0 };
      const allReviewersAlreadyApproved = reviewInfo.total > 0 && reviewInfo.approved === reviewInfo.total;
      const nextSubmissionStatus = allReviewersAlreadyApproved ? "approving" : "reviewing";

      await client.query(
        `UPDATE submissions
         SET title = $1,
             abstract = $2,
             keywords = $3,
             status = $4
         WHERE id = $5::uuid`,
        [
          normalizedTitle || row.title,
          normalizedAbstract || row.abstract,
          normalizedKeywords || row.keywords,
          nextSubmissionStatus,
          submissionId
        ]
      );

      const targetDirectory = path.join(uploadsRoot, submissionId);
      await mkdir(targetDirectory, { recursive: true });

      if (thesisFile) {
        const oldThesis = await client.query<{ file_url: string }>(
          `SELECT file_url
           FROM submission_files
           WHERE submission_id = $1::uuid AND file_type = 'thesis'`,
          [submissionId]
        );
        await client.query(
          `DELETE FROM submission_files
           WHERE submission_id = $1::uuid AND file_type = 'thesis'`,
          [submissionId]
        );
        for (const file of oldThesis.rows) {
          await this.deleteFileSilently(file.file_url);
        }

        const thesisPath = await this.moveUploadedFile(thesisFile, targetDirectory);
        await client.query(
          `INSERT INTO submission_files (id, submission_id, file_name, file_url, file_type)
           VALUES ($1, $2::uuid, $3, $4, 'thesis')`,
          [randomUUID(), submissionId, thesisFile.originalname, thesisPath]
        );
      }

      if (attachments.length > 0) {
        const oldAttachments = await client.query<{ file_url: string }>(
          `SELECT file_url
           FROM submission_files
           WHERE submission_id = $1::uuid AND file_type = 'attachment'`,
          [submissionId]
        );
        await client.query(
          `DELETE FROM submission_files
           WHERE submission_id = $1::uuid AND file_type = 'attachment'`,
          [submissionId]
        );
        for (const file of oldAttachments.rows) {
          await this.deleteFileSilently(file.file_url);
        }

        for (const attachment of attachments) {
          const attachmentPath = await this.moveUploadedFile(attachment, targetDirectory);
          await client.query(
            `INSERT INTO submission_files (id, submission_id, file_name, file_url, file_type)
             VALUES ($1, $2::uuid, $3, $4, 'attachment')`,
            [randomUUID(), submissionId, attachment.originalname, attachmentPath]
          );
        }
      }

      if (!allReviewersAlreadyApproved) {
        await client.query(
          `UPDATE reviews
           SET status = 'pending',
               decision = 'pending',
               comment = NULL,
               decided_at = NULL
           WHERE submission_id = $1::uuid`,
          [submissionId]
        );
      }
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2::uuid, $3, 'student', 'resubmitted', $4::jsonb)`,
        [
          randomUUID(),
          submissionId,
          actor.sub,
          JSON.stringify({
            titleUpdated: Boolean(normalizedTitle),
            abstractUpdated: Boolean(normalizedAbstract),
            keywordsUpdated: Boolean(normalizedKeywords),
            thesisFileReplaced: Boolean(thesisFile),
            attachmentsReplaced: attachments.length > 0,
            nextStatus: nextSubmissionStatus,
            reviewerDecisionsReset: !allReviewersAlreadyApproved
          })
        ]
      );

      await client.query("COMMIT");
      return { id: submissionId, status: nextSubmissionStatus };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSubmissionFileStream(user: JwtPayload, submissionId: string, fileId: string) {
    const result = await this.db.query<{
      file_name: string;
      file_url: string;
      file_type: string;
    }>(
      `SELECT sf.file_name, sf.file_url, sf.file_type
       FROM submission_files sf
       WHERE sf.id = $1::uuid AND sf.submission_id = $2::uuid
       LIMIT 1`,
      [fileId, submissionId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundException("File not found");
    }

    const row = result.rows[0];

    if (user.role === "admin") {
      // allowed
    } else if (user.role === "student") {
      const accessResult = await this.db.query(
        `SELECT 1
         FROM submissions s
         WHERE s.id = $1::uuid
           AND (
             s.student_id = $2::text
             OR EXISTS (
               SELECT 1
               FROM submission_authors sa
               WHERE sa.submission_id = s.id
                 AND sa.user_id = $2::uuid
             )
           )
         LIMIT 1`,
        [submissionId, user.sub]
      );
      if (accessResult.rowCount === 0) {
        throw new ForbiddenException("You are not allowed to access this submission file");
      }
    } else if (user.role === "reviewer") {
      const accessResult = await this.db.query(
        `SELECT 1
         FROM submission_reviewers sr
         WHERE sr.submission_id = $1::uuid AND sr.user_id = $2::uuid
         UNION
         SELECT 1
         FROM reviews r
         WHERE r.submission_id = $1::uuid AND r.reviewer_id = $2::uuid
         LIMIT 1`,
        [submissionId, user.sub]
      );
      if (accessResult.rowCount === 0) {
        throw new ForbiddenException("You are not assigned to this submission");
      }
    } else {
      throw new ForbiddenException();
    }

    this.assertResolvedFilePathUnderSubmission(row.file_url, submissionId);

    try {
      await access(row.file_url, fsConstants.R_OK);
    } catch {
      throw new NotFoundException("File missing on server");
    }

    const contentType = this.contentTypeForFileName(row.file_name);
    const stream = createReadStream(row.file_url);

    return {
      stream,
      contentType,
      fileName: row.file_name
    };
  }

  private contentTypeForFileName(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const map: Record<string, string> = {
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".zip": "application/zip",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg"
    };
    return map[ext] || "application/octet-stream";
  }

  private assertResolvedFilePathUnderSubmission(fileUrl: string, submissionId: string): void {
    const submissionDir = path.resolve(path.join(uploadsRoot, submissionId));
    const resolvedFile = path.resolve(fileUrl);
    const relative = path.relative(submissionDir, resolvedFile);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new ForbiddenException();
    }
  }

  private async moveUploadedFile(file: UploadedFile, destinationDir: string) {
    const normalizedName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    const destination = path.join(destinationDir, normalizedName);
    await rename(file.path, destination);
    return destination;
  }

  private async deleteFileSilently(filePath: string) {
    try {
      await unlink(filePath);
    } catch {
      // ignore missing file on disk
    }
  }
}
