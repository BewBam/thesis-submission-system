import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, rename, stat, unlink } from "node:fs/promises";
import * as path from "node:path";
import type { PoolClient } from "pg";
import { DatabaseError } from "pg";
import type { JwtPayload } from "../auth/jwt.strategy";
import { DspaceProvisionerService } from "../archive/dspace-provisioner.service";
import { SubmissionPeriodsService } from "../archive/submission-periods.service";
import { WorkflowMailService } from "../mail/workflow-mail.service";
import { UsersService } from "../users/users.service";
import { createPgPool } from "../users/db-pool";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { SaveDraftDto } from "./dto/save-draft.dto";
import {
  mergeThesisMetadata,
  normalizeThesisMetadata,
  THESIS_METADATA_SELECT
} from "./submission-metadata";
import { SubmissionFormFieldsService } from "./submission-form-fields.service";
import { THESIS_MAX_FILE_SIZE_BYTES, THESIS_MAX_FILE_SIZE_MB, isThesisPdfUpload } from "./submission-limits";
import {
  assertStudentSubmissionCapability,
  assertSubmissionOwnership,
  getStudentSubmissionCapabilities,
  type StudentSubmissionAction
} from "./submission-student-access";

const uploadsRoot = path.join(process.cwd(), "uploads", "submissions");

type UploadedFile = {
  originalname: string;
  mimetype: string;
  path: string;
  filename: string;
};

@Injectable()
export class SubmissionsService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly submissionPeriodsService: SubmissionPeriodsService,
    private readonly dspaceProvisioner: DspaceProvisionerService,
    private readonly formFieldsService: SubmissionFormFieldsService,
    private readonly workflowMail: WorkflowMailService
  ) {}

  private isAdminActor(actor: JwtPayload): boolean {
    return actor.role === "admin";
  }

  private assertCanSubmitForStudent(actor: JwtPayload, studentId: string) {
    if (this.isAdminActor(actor)) {
      return;
    }
    if (actor.role !== "student") {
      throw new BadRequestException("Only students can submit theses");
    }
    if (actor.sub !== studentId) {
      throw new ForbiddenException("Students can only submit as themselves");
    }
  }

  private assertPeriodMatchesStudentFaculty(student: { facultyId: string | null }, periodFacultyId: string) {
    if (!student.facultyId) {
      throw new BadRequestException("This student is not assigned to a faculty");
    }
    if (periodFacultyId !== student.facultyId) {
      throw new BadRequestException("The submission period must belong to the student's faculty");
    }
  }

  private parseExtraMetadata(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === undefined || value === null) {
        continue;
      }
      out[key] = String(value);
    }
    return out;
  }

  private async resolveConfigurableFields(
    dto: Record<string, unknown>,
    options: { required: boolean; existingExtra?: Record<string, string> }
  ) {
    return this.formFieldsService.resolveMetadataValues(dto, options);
  }

  private async assertThesisFileValid(thesisFile: UploadedFile) {
    if (!isThesisPdfUpload(thesisFile)) {
      throw new BadRequestException("Thesis file must be a PDF");
    }
    const fileStat = await stat(thesisFile.path);
    if (fileStat.size > THESIS_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(`Thesis PDF must be at most ${THESIS_MAX_FILE_SIZE_MB} MB`);
    }
  }

  private async assertStudentMaySubmit(
    client: PoolClient,
    studentId: string,
    options: { excludeSubmissionId?: string } = {}
  ) {
    const { excludeSubmissionId } = options;
    const result = await client.query<{ id: string; status: string; student_id: string }>(
      `SELECT s.id::text AS id, s.status, s.student_id::text AS student_id
       FROM submissions s
       WHERE s.status <> 'draft'
         AND (
           s.student_id = $1
           OR EXISTS (
             SELECT 1
             FROM submission_authors sa
             WHERE sa.submission_id = s.id
               AND sa.user_id = $1
           )
         )
       ORDER BY s.created_at DESC`,
      [studentId]
    );

    for (const row of result.rows) {
      const isOwnSubmit = String(row.student_id) === String(studentId);
      const status = row.status === "reject" ? "rejected" : row.status;

      if (excludeSubmissionId && row.id === excludeSubmissionId) {
        if (!isOwnSubmit) {
          throw new BadRequestException(
            "Only the submitting student can resubmit this thesis"
          );
        }
        if (status === "rejected" || status === "approved") {
          continue;
        }
        if (status === "reviewing") {
          throw new BadRequestException(
            "This thesis has already been submitted and cannot be submitted again unless it was rejected or returned for revision"
          );
        }
        continue;
      }

      if (isOwnSubmit) {
        throw new BadRequestException(
          "You already have a submitted thesis. Only one thesis can be submitted per student"
        );
      }

      throw new BadRequestException(
        "You are already listed as an author on a submitted thesis, so you cannot submit another thesis"
      );
    }
  }

  /** Co-authors on a submitted thesis cannot create or keep a personal draft. */
  private async assertStudentMayHaveDraft(client: PoolClient, studentId: string) {
    const result = await client.query<{ id: string }>(
      `SELECT s.id::text AS id
       FROM submissions s
       WHERE s.status <> 'draft'
         AND (
           s.student_id = $1
           OR EXISTS (
             SELECT 1
             FROM submission_authors sa
             WHERE sa.submission_id = s.id
               AND sa.user_id = $1
           )
         )
       LIMIT 1`,
      [studentId]
    );
    if (result.rows[0]) {
      throw new BadRequestException(
        "You are already listed as an author on a submitted thesis, so you cannot create or edit a draft"
      );
    }
  }

  /** When a thesis is submitted, remove personal drafts of all listed authors (except the submission itself). */
  private async deleteDraftsForAuthors(
    client: PoolClient,
    authorIds: string[],
    excludeSubmissionId: string
  ) {
    if (authorIds.length === 0) {
      return;
    }
    const drafts = await client.query<{ id: string }>(
      `SELECT id::text AS id
       FROM submissions
       WHERE status = 'draft'
         AND student_id = ANY($1::text[])
         AND id <> $2::uuid`,
      [authorIds, excludeSubmissionId]
    );
    for (const draft of drafts.rows) {
      const files = await client.query<{ file_url: string }>(
        `SELECT file_url FROM submission_files WHERE submission_id = $1::uuid`,
        [draft.id]
      );
      await client.query(`DELETE FROM submissions WHERE id = $1::uuid`, [draft.id]);
      for (const file of files.rows) {
        await this.deleteFileSilently(file.file_url);
      }
      try {
        await unlink(path.join(uploadsRoot, draft.id));
      } catch {
        // directory may already be gone
      }
    }
  }

  /** Co-authors on a different non-draft thesis cannot be attached to another submission. */
  private async assertAuthorsAvailableForSubmission(
    client: PoolClient,
    authorIds: string[],
    excludeSubmissionId?: string
  ) {
    for (const authorId of authorIds) {
      const result = await client.query<{ id: string }>(
        `SELECT s.id::text AS id
         FROM submissions s
         WHERE s.status <> 'draft'
           AND (
             s.student_id = $1
             OR EXISTS (
               SELECT 1
               FROM submission_authors sa
               WHERE sa.submission_id = s.id
                 AND sa.user_id = $1
             )
           )
           AND ($2::uuid IS NULL OR s.id <> $2::uuid)
         LIMIT 1`,
        [authorId, excludeSubmissionId ?? null]
      );
      if (result.rows[0]) {
        throw new BadRequestException(
          "One or more selected authors are already on another submitted thesis and cannot be included"
        );
      }
    }
  }

  private async loadReviewDecisions(client: PoolClient, submissionId: string): Promise<string[]> {
    const result = await client.query<{ decision: string }>(
      `SELECT decision FROM reviews WHERE submission_id = $1::uuid`,
      [submissionId]
    );
    return result.rows.map((row) => row.decision);
  }

  private async assertStudentSubmissionAction(
    client: PoolClient,
    submissionId: string,
    studentId: string,
    action: StudentSubmissionAction
  ): Promise<{ status: string }> {
    const existing = await client.query<{ student_id: string; status: string }>(
      `SELECT student_id, status FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
      [submissionId]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    assertSubmissionOwnership(studentId, row.student_id);
    const reviewDecisions = await this.loadReviewDecisions(client, submissionId);
    const capabilities = getStudentSubmissionCapabilities(row.status, reviewDecisions);
    assertStudentSubmissionCapability(capabilities, action);
    return { status: row.status };
  }

  private rethrowSubmissionLimitError(error: unknown): never {
    if (error instanceof DatabaseError && error.code === "23505") {
      const constraint = error.constraint || "";
      if (constraint.includes("one_draft")) {
        throw new BadRequestException(
          "You already have a draft. Update your existing draft instead of creating a new one"
        );
      }
      throw new BadRequestException(
        "You already have a submitted thesis. Only one thesis can be in review at a time"
      );
    }
    throw error;
  }

  async createSubmission(
    actor: JwtPayload,
    dto: CreateSubmissionDto,
    thesisFile: UploadedFile | undefined
  ) {
    this.assertCanSubmitForStudent(actor, dto.studentId);

    const existingDraft = await this.db.query<{ id: string }>(
      `SELECT id FROM submissions
       WHERE student_id = $1 AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 1`,
      [dto.studentId]
    );
    if (existingDraft.rows[0]?.id) {
      return this.submitSubmission(
        actor,
        existingDraft.rows[0].id,
        dto as unknown as SaveDraftDto,
        thesisFile
      );
    }

    if (!thesisFile) {
      throw new BadRequestException("Thesis PDF is required");
    }
    await this.assertThesisFileValid(thesisFile);

    const student = await this.usersService.findById(dto.studentId);
    if (!student || student.role !== "student") {
      throw new BadRequestException("Invalid student account");
    }
    const meta = normalizeThesisMetadata(dto, student.username, { required: true });
    const formValues = await this.resolveConfigurableFields(
      { ...(dto.metadata || {}), ...dto, abstract: dto.abstract },
      { required: true }
    );
    const dateIssued = formValues.columns.date_issued ?? meta.dateIssued;
    const publisher = formValues.columns.publisher ?? meta.publisher;
    const documentType = formValues.columns.document_type ?? meta.documentType;
    const language = formValues.columns.language ?? meta.language;
    const description = formValues.columns.description ?? meta.description;
    const abstractText = formValues.columns.abstract ?? dto.abstract ?? "";
    const extraMetadata = formValues.extra;

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

    const reviewerSnapshot = reviewerUsers.map((user) => user.displayName || user.username).join("; ");

    const period = await this.submissionPeriodsService.resolveOpenPeriod(dto.submissionPeriodId);
    this.assertPeriodMatchesStudentFaculty(student, period.facultyId);

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

    try {
      const client = await this.db.connect();
      try {
        await client.query("BEGIN");
        await this.assertStudentMaySubmit(client, dto.studentId);
        await this.assertAuthorsAvailableForSubmission(client, uniqueAuthorIds);
        await client.query(
          `INSERT INTO submissions (
             id, title, author, reviewer, abstract, keywords, student_id, status,
             submission_period_id, university_name, faculty_name, semester_name,
             student_email, title_vi, title_en, thesis_advisors, major, thesis_year,
             date_issued, publisher, document_type, language, description, extra_metadata
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'reviewing', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb)`,
          [
            submissionId,
            meta.title,
            authorSnapshot,
            reviewerSnapshot,
            abstractText,
            "",
            dto.studentId,
            period.periodId,
            period.universityName,
            period.facultyName,
            period.semesterName,
            meta.email,
            meta.titleVi,
            meta.titleEn,
            meta.thesisAdvisors,
            meta.major,
            meta.thesisYear,
            dateIssued,
            publisher,
            documentType,
            language,
            description,
            JSON.stringify(extraMetadata)
          ]
        );
        await client.query(
          `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
             VALUES ($1, $2, $3, $5, 'submitted', $4::jsonb)`,
          [
            randomUUID(),
            submissionId,
            actor.sub,
            JSON.stringify({
              title: meta.title,
              titleVi: meta.titleVi,
              titleEn: meta.titleEn,
              email: meta.email,
              thesisAdvisors: meta.thesisAdvisors,
              major: meta.major,
              thesisYear: meta.thesisYear,
              dateIssued: meta.dateIssued,
              publisher: meta.publisher,
              documentType: meta.documentType,
              language: meta.language,
              description: meta.description,
              authorIds: uniqueAuthorIds,
              reviewerIds: uniqueReviewerIds,
              submissionPeriodId: period.periodId,
              universityName: period.universityName,
              facultyName: period.facultyName,
              semesterName: period.semesterName,
              submittedOnBehalf: this.isAdminActor(actor) ? dto.studentId : undefined
            }),
            actor.role
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

        await this.replaceReviewers(client, submissionId, uniqueReviewerIds);

        await this.deleteDraftsForAuthors(client, uniqueAuthorIds, submissionId);

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
        this.rethrowSubmissionLimitError(error);
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
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

    this.workflowMail.notifySafely("reviewer_assigned", () =>
      this.workflowMail.notifyReviewersOnSubmit(submissionId)
    );
    this.workflowMail.notifySafely("student_submitted", () =>
      this.workflowMail.notifyStudentOnSubmitted(submissionId, false)
    );

    return {
      id: submissionId,
      status: "reviewing"
    };
  }

  async saveDraft(actor: JwtPayload, dto: SaveDraftDto, thesisFile?: UploadedFile) {
    this.assertCanSubmitForStudent(actor, dto.studentId);

    const lockClient = await this.db.connect();
    try {
      await this.assertStudentMayHaveDraft(lockClient, dto.studentId);
    } finally {
      lockClient.release();
    }

    const existingDraft = await this.db.query<{ id: string }>(
      `SELECT id FROM submissions
       WHERE student_id = $1 AND status = 'draft'
       ORDER BY created_at DESC
       LIMIT 1`,
      [dto.studentId]
    );
    const draftId = existingDraft.rows[0]?.id;
    if (draftId) {
      return this.updateDraft(actor, draftId, dto, thesisFile);
    }

    if (thesisFile) {
      await this.assertThesisFileValid(thesisFile);
    }

    const student = await this.usersService.findById(dto.studentId);
    if (!student || student.role !== "student") {
      throw new BadRequestException("Invalid student account");
    }
    const meta = normalizeThesisMetadata(dto, student.username, { required: false });
    const formValues = await this.resolveConfigurableFields(
      { ...(dto.metadata || {}), ...dto, abstract: dto.abstract },
      { required: false }
    );
    const dateIssued = formValues.columns.date_issued ?? meta.dateIssued;
    const publisher = formValues.columns.publisher ?? meta.publisher;
    const documentType = formValues.columns.document_type ?? meta.documentType;
    const language = formValues.columns.language ?? meta.language;
    const description = formValues.columns.description ?? meta.description;
    const abstract = formValues.columns.abstract ?? dto.abstract?.trim() ?? "";
    const extraMetadata = formValues.extra;

    const { authorIds, authorSnapshot, reviewerIds, reviewerSnapshot } = await this.resolveAuthorsAndReviewers(
      dto.studentId,
      dto.authorIds,
      dto.reviewerIds,
      { reviewersRequired: false }
    );

    let periodContext: Awaited<ReturnType<SubmissionPeriodsService["resolveOpenPeriod"]>> | null = null;
    if (dto.submissionPeriodId) {
      periodContext = await this.submissionPeriodsService.resolveOpenPeriod(dto.submissionPeriodId);
      this.assertPeriodMatchesStudentFaculty(student, periodContext.facultyId);
    }

    const submissionId = randomUUID();
    const targetDirectory = path.join(uploadsRoot, submissionId);
    await mkdir(targetDirectory, { recursive: true });

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO submissions (
           id, title, author, reviewer, abstract, keywords, student_id, status,
           submission_period_id, university_name, faculty_name, semester_name,
           student_email, title_vi, title_en, thesis_advisors, major, thesis_year,
           date_issued, publisher, document_type, language, description, extra_metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb)`,
        [
          submissionId,
          meta.title,
          authorSnapshot,
          reviewerSnapshot,
          abstract,
          "",
          dto.studentId,
          periodContext?.periodId ?? null,
          periodContext?.universityName ?? "",
          periodContext?.facultyName ?? "",
          periodContext?.semesterName ?? "",
          meta.email,
          meta.titleVi,
          meta.titleEn,
          meta.thesisAdvisors,
          meta.major,
          meta.thesisYear,
          dateIssued,
          publisher,
          documentType,
          language,
          description,
          JSON.stringify(extraMetadata)
        ]
      );

      await this.replaceAuthors(client, submissionId, authorIds);
      await this.replaceReviewers(client, submissionId, reviewerIds);

      if (thesisFile) {
        await this.replaceThesisFile(client, submissionId, thesisFile, targetDirectory);
      }

      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $5, 'draft_saved', $4::jsonb)`,
        [
          randomUUID(),
          submissionId,
          actor.sub,
          JSON.stringify({
            title: meta.title,
            submissionPeriodId: periodContext?.periodId ?? null
          }),
          actor.role
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      this.rethrowSubmissionLimitError(error);
    } finally {
      client.release();
    }

    return { id: submissionId, status: "draft" };
  }

  async updateDraft(
    actor: JwtPayload,
    submissionId: string,
    dto: SaveDraftDto,
    thesisFile?: UploadedFile
  ) {
    if (actor.role !== "student" && !this.isAdminActor(actor)) {
      throw new ForbiddenException();
    }
    if (thesisFile) {
      await this.assertThesisFileValid(thesisFile);
    }

    const client = await this.db.connect();
    let currentStatus = "draft";
    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        student_id: string;
        status: string;
        submission_period_id: string | null;
        title: string;
        abstract: string;
        student_email: string;
        title_vi: string;
        title_en: string;
        thesis_advisors: string;
        major: string;
        thesis_year: string;
        date_issued: string;
        publisher: string;
        document_type: string;
        language: string;
        description: string;
        extra_metadata: unknown;
      }>(
        `SELECT student_id, status, submission_period_id, title, abstract,
                student_email, title_vi, title_en, thesis_advisors, major, thesis_year,
                date_issued, publisher, document_type, language, description, extra_metadata
         FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
        [submissionId]
      );
      const row = existing.rows[0];
      if (!row) {
        throw new NotFoundException("Submission not found");
      }
      if (row.status === "draft") {
        await this.assertStudentMayHaveDraft(client, row.student_id);
      }
      currentStatus = row.status;
      this.assertCanSubmitForStudent(actor, row.student_id);
      if (dto.studentId && dto.studentId !== row.student_id) {
        throw new BadRequestException("Cannot change the submitting student");
      }
      await this.assertStudentSubmissionAction(client, submissionId, row.student_id, "edit");

      const student = await this.usersService.findById(row.student_id);
      if (!student) {
        throw new BadRequestException("Invalid student account");
      }
      const meta = mergeThesisMetadata(
        dto,
        student.username,
        {
          email: row.student_email,
          titleVi: row.title_vi,
          titleEn: row.title_en || row.title,
          title: row.title,
          thesisAdvisors: row.thesis_advisors,
          major: row.major,
          thesisYear: row.thesis_year,
          dateIssued: row.date_issued,
          publisher: row.publisher,
          documentType: row.document_type,
          language: row.language,
          description: row.description
        },
        { required: false }
      );

      const { authorIds, authorSnapshot, reviewerIds, reviewerSnapshot } = await this.resolveAuthorsAndReviewers(
        row.student_id,
        dto.authorIds,
        dto.reviewerIds,
        { reviewersRequired: false }
      );

      let periodContext: Awaited<ReturnType<SubmissionPeriodsService["resolveOpenPeriod"]>> | null = null;
      const periodId = dto.submissionPeriodId ?? row.submission_period_id;
      if (periodId) {
        if (row.status === "draft") {
          periodContext = await this.submissionPeriodsService.resolveOpenPeriod(periodId);
        } else {
          const periodCheck = await client.query(
            `SELECT 1 FROM submission_periods WHERE id = $1::uuid LIMIT 1`,
            [periodId]
          );
          if (!periodCheck.rows[0]) {
            throw new BadRequestException("Submission period not found");
          }
          const periodMeta = await this.submissionPeriodsService.resolveOpenPeriod(periodId).catch(() => null);
          if (periodMeta) {
            periodContext = periodMeta;
          } else {
            const meta = await client.query<{
              university_name: string;
              faculty_name: string;
              semester_name: string;
              faculty_id: string;
            }>(
              `SELECT 'Trường Đại học Bách khoa TP.HCM' AS university_name, f.id::text AS faculty_id, f.name AS faculty_name, s.name AS semester_name
               FROM submission_periods sp
               JOIN semesters s ON s.id = sp.semester_id
               JOIN faculties f ON f.id = s.faculty_id
               WHERE sp.id = $1::uuid
               LIMIT 1`,
              [periodId]
            );
            const m = meta.rows[0];
            periodContext = m
              ? {
                  periodId,
                  periodName: "",
                  facultyId: m.faculty_id,
                  facultyCode: "",
                  facultyName: m.faculty_name,
                  semesterId: "",
                  semesterCode: "",
                  semesterName: m.semester_name,
                  universityId: "",
                  universityName: m.university_name,
                  allowResubmit: true
                }
              : null;
          }
        }
      }
      if (periodContext?.facultyId) {
        this.assertPeriodMatchesStudentFaculty(student, periodContext.facultyId);
      }

      const formValues = await this.resolveConfigurableFields(
        { ...(dto.metadata || {}), ...dto, abstract: dto.abstract ?? row.abstract },
        { required: false, existingExtra: this.parseExtraMetadata(row.extra_metadata) }
      );
      const dateIssued = formValues.columns.date_issued ?? meta.dateIssued;
      const publisher = formValues.columns.publisher ?? meta.publisher;
      const documentType = formValues.columns.document_type ?? meta.documentType;
      const language = formValues.columns.language ?? meta.language;
      const description = formValues.columns.description ?? meta.description;
      const abstract = formValues.columns.abstract ?? dto.abstract?.trim() ?? row.abstract ?? "";
      const extraMetadata = formValues.extra;

      await client.query(
        `UPDATE submissions
         SET title = $1,
             author = $2,
             reviewer = $3,
             abstract = $4,
             submission_period_id = COALESCE($5, submission_period_id),
             university_name = COALESCE($6, university_name),
             faculty_name = COALESCE($7, faculty_name),
             semester_name = COALESCE($8, semester_name),
             student_email = $9,
             title_vi = $10,
             title_en = $11,
             thesis_advisors = $12,
             major = $13,
             thesis_year = $14,
             date_issued = $15,
             publisher = $16,
             document_type = $17,
             language = $18,
             description = $19,
             extra_metadata = $20::jsonb
         WHERE id = $21::uuid`,
        [
          meta.title,
          authorSnapshot,
          reviewerSnapshot,
          abstract,
          periodContext?.periodId ?? null,
          periodContext?.universityName ?? null,
          periodContext?.facultyName ?? null,
          periodContext?.semesterName ?? null,
          meta.email,
          meta.titleVi,
          meta.titleEn,
          meta.thesisAdvisors,
          meta.major,
          meta.thesisYear,
          dateIssued,
          publisher,
          documentType,
          language,
          description,
          JSON.stringify(extraMetadata),
          submissionId
        ]
      );

      await this.replaceAuthors(client, submissionId, authorIds);
      await this.replaceReviewers(client, submissionId, reviewerIds);

      if (thesisFile) {
        const targetDirectory = path.join(uploadsRoot, submissionId);
        await mkdir(targetDirectory, { recursive: true });
        await this.replaceThesisFile(client, submissionId, thesisFile, targetDirectory);
      }

      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $5, 'draft_updated', $4::jsonb)`,
        [randomUUID(), submissionId, actor.sub, JSON.stringify({ title: meta.title }), actor.role]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { id: submissionId, status: currentStatus };
  }

  async submitSubmission(
    actor: JwtPayload,
    submissionId: string,
    dto: SaveDraftDto,
    thesisFile?: UploadedFile
  ) {
    if (actor.role !== "student" && !this.isAdminActor(actor)) {
      throw new ForbiddenException();
    }
    if (thesisFile) {
      await this.assertThesisFileValid(thesisFile);
    }

    let resubmit = false;
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        student_id: string;
        status: string;
        submission_period_id: string | null;
        title: string;
        abstract: string;
        student_email: string;
        title_vi: string;
        title_en: string;
        thesis_advisors: string;
        major: string;
        thesis_year: string;
        date_issued: string;
        publisher: string;
        document_type: string;
        language: string;
        description: string;
        extra_metadata: unknown;
      }>(
        `SELECT student_id, status, submission_period_id, title, abstract,
                student_email, title_vi, title_en, thesis_advisors, major, thesis_year,
                date_issued, publisher, document_type, language, description, extra_metadata
         FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
        [submissionId]
      );
      const row = existing.rows[0];
      if (!row) {
        throw new NotFoundException("Submission not found");
      }
      this.assertCanSubmitForStudent(actor, row.student_id);
      if (dto.studentId && dto.studentId !== row.student_id) {
        throw new BadRequestException("Cannot change the submitting student");
      }
      resubmit = row.status === "rejected" || row.status === "reject" || row.status === "approved";
      await this.assertStudentSubmissionAction(client, submissionId, row.student_id, "submit");

      if (row.status === "draft") {
        await this.assertStudentMaySubmit(client, row.student_id);
      } else {
        await this.assertStudentMaySubmit(client, row.student_id, {
          excludeSubmissionId: submissionId
        });
      }

      const student = await this.usersService.findById(row.student_id);
      if (!student) {
        throw new BadRequestException("Invalid student account");
      }
      const meta = mergeThesisMetadata(
        dto,
        student.username,
        {
          email: row.student_email,
          titleVi: row.title_vi,
          titleEn: row.title_en || row.title,
          title: row.title,
          thesisAdvisors: row.thesis_advisors,
          major: row.major,
          thesisYear: row.thesis_year,
          dateIssued: row.date_issued,
          publisher: row.publisher,
          documentType: row.document_type,
          language: row.language,
          description: row.description
        },
        { required: true }
      );
      const formValues = await this.resolveConfigurableFields(
        {
          ...(dto.metadata || {}),
          ...dto,
          abstract: dto.abstract ?? row.abstract,
          dateIssued: dto.dateIssued ?? row.date_issued,
          publisher: dto.publisher ?? row.publisher,
          documentType: dto.documentType ?? row.document_type,
          language: dto.language ?? row.language,
          description: dto.description ?? row.description
        },
        { required: true, existingExtra: this.parseExtraMetadata(row.extra_metadata) }
      );
      const dateIssued = formValues.columns.date_issued ?? meta.dateIssued;
      const publisher = formValues.columns.publisher ?? meta.publisher;
      const documentType = formValues.columns.document_type ?? meta.documentType;
      const language = formValues.columns.language ?? meta.language;
      const description = formValues.columns.description ?? meta.description;
      const abstract = formValues.columns.abstract ?? (dto.abstract?.trim() || row.abstract);
      const extraMetadata = formValues.extra;

      const periodId = dto.submissionPeriodId ?? row.submission_period_id;
      if (!periodId) {
        throw new BadRequestException("Submission period is required");
      }

      let periodContext;
      if (row.status === "draft") {
        periodContext = await this.submissionPeriodsService.resolveOpenPeriod(periodId);
      } else if (row.status === "rejected" || row.status === "reject" || row.status === "approved") {
        const meta = await client.query<{
          university_name: string;
          faculty_id: string;
          faculty_name: string;
          semester_name: string;
        }>(
          `SELECT 'Trường Đại học Bách khoa TP.HCM' AS university_name, f.id::text AS faculty_id, f.name AS faculty_name, s.name AS semester_name
           FROM submission_periods sp
           JOIN semesters s ON s.id = sp.semester_id
           JOIN faculties f ON f.id = s.faculty_id
           WHERE sp.id = $1::uuid
           LIMIT 1`,
          [periodId]
        );
        const m = meta.rows[0];
        if (!m) {
          throw new BadRequestException("Submission period not found");
        }
        periodContext = {
          periodId,
          periodName: "",
          facultyId: m.faculty_id,
          facultyCode: "",
          facultyName: m.faculty_name,
          semesterId: "",
          semesterCode: "",
          semesterName: m.semester_name,
          universityId: "",
          universityName: m.university_name,
          allowResubmit: true
        };
      } else {
        throw new BadRequestException("This thesis cannot be submitted in its current state");
      }
      this.assertPeriodMatchesStudentFaculty(student, periodContext.facultyId);

      const { authorIds, authorSnapshot, reviewerIds, reviewerSnapshot } = await this.resolveAuthorsAndReviewers(
        row.student_id,
        dto.authorIds,
        dto.reviewerIds,
        { reviewersRequired: true }
      );

      await this.assertAuthorsAvailableForSubmission(client, authorIds, submissionId);

      const thesisExists = await client.query(
        `SELECT 1 FROM submission_files WHERE submission_id = $1::uuid AND file_type = 'thesis' LIMIT 1`,
        [submissionId]
      );
      if (!thesisExists.rows[0] && !thesisFile) {
        throw new BadRequestException("Thesis PDF is required");
      }

      await client.query(
        `UPDATE submissions
         SET title = $1,
             author = $2,
             reviewer = $3,
             abstract = $4,
             status = 'reviewing',
             submission_period_id = $5,
             university_name = $6,
             faculty_name = $7,
             semester_name = $8,
             student_email = $9,
             title_vi = $10,
             title_en = $11,
             thesis_advisors = $12,
             major = $13,
             thesis_year = $14,
             date_issued = $15,
             publisher = $16,
             document_type = $17,
             language = $18,
             description = $19,
             extra_metadata = $20::jsonb
         WHERE id = $21::uuid`,
        [
          meta.title,
          authorSnapshot,
          reviewerSnapshot,
          abstract,
          periodContext.periodId,
          periodContext.universityName,
          periodContext.facultyName,
          periodContext.semesterName,
          meta.email,
          meta.titleVi,
          meta.titleEn,
          meta.thesisAdvisors,
          meta.major,
          meta.thesisYear,
          dateIssued,
          publisher,
          documentType,
          language,
          description,
          JSON.stringify(extraMetadata),
          submissionId
        ]
      );

      await this.replaceAuthors(client, submissionId, authorIds);
      await this.replaceReviewers(client, submissionId, reviewerIds);

      await this.deleteDraftsForAuthors(client, authorIds, submissionId);

      if (thesisFile) {
        const targetDirectory = path.join(uploadsRoot, submissionId);
        await mkdir(targetDirectory, { recursive: true });
        await this.replaceThesisFile(client, submissionId, thesisFile, targetDirectory);
      }

      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $5, 'submitted', $4::jsonb)`,
        [
          randomUUID(),
          submissionId,
          actor.sub,
          JSON.stringify({
            title: meta.title,
            titleVi: meta.titleVi,
            titleEn: meta.titleEn,
            email: meta.email,
            thesisAdvisors: meta.thesisAdvisors,
            major: meta.major,
            thesisYear: meta.thesisYear,
            authorIds,
            reviewerIds,
            submissionPeriodId: periodContext.periodId,
            fromStatus: row.status,
            submittedOnBehalf: this.isAdminActor(actor) ? row.student_id : undefined
          }),
          actor.role
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      this.rethrowSubmissionLimitError(error);
    } finally {
      client.release();
    }

    this.workflowMail.notifySafely("reviewer_assigned", () =>
      this.workflowMail.notifyReviewersOnSubmit(submissionId)
    );
    this.workflowMail.notifySafely("student_submitted", () =>
      this.workflowMail.notifyStudentOnSubmitted(submissionId, resubmit)
    );

    return { id: submissionId, status: "reviewing" };
  }

  async deleteSubmission(actor: JwtPayload, submissionId: string) {
    if (this.canStaffDeleteSubmission(actor.role)) {
      return this.deleteSubmissionAsStaff(actor, submissionId);
    }

    if (actor.role !== "student" && !this.isAdminActor(actor)) {
      throw new ForbiddenException();
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await this.assertStudentSubmissionAction(client, submissionId, actor.sub, "delete");

      const files = await client.query<{ file_url: string }>(
        `SELECT file_url FROM submission_files WHERE submission_id = $1::uuid`,
        [submissionId]
      );
      await client.query(`DELETE FROM submissions WHERE id = $1::uuid`, [submissionId]);
      await client.query("COMMIT");

      for (const file of files.rows) {
        await this.deleteFileSilently(file.file_url);
      }
      try {
        await unlink(path.join(uploadsRoot, submissionId));
      } catch {
        // directory may already be gone
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { ok: true };
  }

  private canStaffDeleteSubmission(role: string): boolean {
    return role === "admin" || role === "library_staff" || role === "director";
  }

  private async deleteSubmissionAsStaff(actor: JwtPayload, submissionId: string) {
    const existing = await this.db.query<{ dspace_item_id: string | null; status: string }>(
      `SELECT dspace_item_id, status FROM submissions WHERE id = $1::uuid LIMIT 1`,
      [submissionId]
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not found");
    }

    let dspaceDeleted = false;
    let dspaceDeleteWarning = false;
    const dspaceItemId = row.dspace_item_id;
    if (dspaceItemId && !dspaceItemId.startsWith("dev-item-")) {
      try {
        await this.dspaceProvisioner.deleteItem(dspaceItemId);
        dspaceDeleted = true;
      } catch (error) {
        dspaceDeleteWarning = true;
        this.logger.warn(
          `DSpace item ${dspaceItemId} delete failed for submission ${submissionId}: ${
            error instanceof Error ? error.message : error
          }`
        );
      }
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const files = await client.query<{ file_url: string }>(
        `SELECT file_url FROM submission_files WHERE submission_id = $1::uuid`,
        [submissionId]
      );
      await client.query(`DELETE FROM submissions WHERE id = $1::uuid`, [submissionId]);
      await client.query("COMMIT");

      for (const file of files.rows) {
        await this.deleteFileSilently(file.file_url);
      }
      try {
        await unlink(path.join(uploadsRoot, submissionId));
      } catch {
        // directory may already be gone
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return {
      ok: true,
      dspaceDeleted,
      dspaceDeleteWarning,
      status: row.status
    };
  }

  async revertSubmissionToDraft(actor: JwtPayload, submissionId: string) {
    if (actor.role !== "student" && !this.isAdminActor(actor)) {
      throw new ForbiddenException();
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ student_id: string; status: string }>(
        `SELECT student_id, status FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
        [submissionId]
      );
      const row = existing.rows[0];
      if (!row) {
        throw new NotFoundException("Submission not found");
      }
      this.assertCanSubmitForStudent(actor, row.student_id);
      const { status } = await this.assertStudentSubmissionAction(
        client,
        submissionId,
        row.student_id,
        "revert_draft"
      );

      await client.query(`UPDATE submissions SET status = 'draft' WHERE id = $1::uuid`, [submissionId]);
      await client.query(`DELETE FROM reviews WHERE submission_id = $1::uuid`, [submissionId]);
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, $5, 'reverted_to_draft', $4::jsonb)`,
        [
          randomUUID(),
          submissionId,
          actor.sub,
          JSON.stringify({ fromStatus: status }),
          actor.role
        ]
      );
      await client.query(
        `INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`,
        [
          randomUUID(),
          submissionId,
          actor.sub,
          JSON.stringify({ from: status, to: "draft", reason: "student_reverted_to_draft" })
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { id: submissionId, status: "draft" };
  }

  private async resolveAuthorsAndReviewers(
    studentId: string,
    authorIdsInput: string[] | undefined,
    reviewerIdsInput: string[] | undefined,
    options: { reviewersRequired: boolean }
  ) {
    const uniqueAuthorIds = Array.from(new Set(authorIdsInput ?? [studentId]));
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
    if (!uniqueAuthorIds.includes(studentId)) {
      throw new BadRequestException("Submitting student must be included in authors");
    }

    const uniqueReviewerIds = Array.from(new Set(reviewerIdsInput ?? []));
    if (options.reviewersRequired && uniqueReviewerIds.length === 0) {
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

    return {
      authorIds: uniqueAuthorIds,
      authorSnapshot: authorUsers.map((user) => user.displayName || user.username).join("; "),
      reviewerIds: uniqueReviewerIds,
      reviewerSnapshot: reviewerUsers.map((user) => user.displayName || user.username).join("; ")
    };
  }

  private async replaceAuthors(
    client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
    submissionId: string,
    authorIds: string[]
  ) {
    await client.query(`DELETE FROM submission_authors WHERE submission_id = $1::uuid`, [submissionId]);
    let sortOrder = 0;
    for (const authorId of authorIds) {
      await client.query(
        `INSERT INTO submission_authors (submission_id, user_id, sort_order) VALUES ($1::uuid, $2, $3)`,
        [submissionId, authorId, sortOrder]
      );
      sortOrder += 1;
    }
  }

  private async replaceReviewers(
    client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
    submissionId: string,
    reviewerIds: string[]
  ) {
    await client.query(`DELETE FROM reviews WHERE submission_id = $1::uuid`, [submissionId]);
    let sortOrder = 0;
    for (const reviewerId of reviewerIds) {
      await client.query(
        `INSERT INTO reviews (id, submission_id, reviewer_id, decision, comment, sort_order)
         VALUES ($1::uuid, $2::uuid, $3, 'pending', NULL, $4)`,
        [randomUUID(), submissionId, reviewerId, sortOrder]
      );
      sortOrder += 1;
    }
  }

  private async replaceThesisFile(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: { file_url: string }[] }> },
    submissionId: string,
    thesisFile: UploadedFile,
    targetDirectory: string
  ) {
    const oldThesis = await client.query(
      `SELECT file_url FROM submission_files WHERE submission_id = $1::uuid AND file_type = 'thesis'`,
      [submissionId]
    );
    await client.query(`DELETE FROM submission_files WHERE submission_id = $1::uuid AND file_type = 'thesis'`, [
      submissionId
    ]);
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

  async getStudentSubmissions(studentId: string) {
    const result = await this.db.query(
      `SELECT s.id,
              s.title,
              COALESCE((
                SELECT string_agg(u.display_name, '; ' ORDER BY sa.sort_order)
                FROM submission_authors sa
                JOIN users u ON u.username = sa.user_id
                WHERE sa.submission_id = s.id
              ), s.author) AS author,
              COALESCE((
                SELECT string_agg(rv.display_name, '; ' ORDER BY r.sort_order)
                FROM reviews r
                JOIN users rv ON rv.username = r.reviewer_id
                WHERE r.submission_id = s.id
              ), s.reviewer) AS reviewer,
              s.abstract,
              s.keywords,
              s.university_name,
              s.faculty_name,
              s.semester_name,
              s.submission_period_id,
              sem.faculty_id::text AS faculty_id,
              sp.semester_id::text AS semester_id,
              ${THESIS_METADATA_SELECT},
              s.status,
              s.created_at,
              COALESCE((
                SELECT json_agg(sa_vis.user_id::text ORDER BY sa_vis.sort_order)
                FROM submission_authors sa_vis
                WHERE sa_vis.submission_id = s.id
              ), '[]'::json) AS author_user_ids,
              COALESCE((
                SELECT json_agg(r_vis.reviewer_id::text ORDER BY r_vis.sort_order)
                FROM reviews r_vis
                WHERE r_vis.submission_id = s.id
              ), '[]'::json) AS reviewer_user_ids,
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
                      'comment', r2.comment,
                      'decidedAt', r2.decided_at,
                      'sortOrder', r2.sort_order
                    )
                    ORDER BY r2.sort_order, COALESCE(u2.display_name, u2.username)
                  ),
                  '[]'::json
                )
                FROM reviews r2
                JOIN users u2 ON u2.username = r2.reviewer_id
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
                LEFT JOIN users u3 ON u3.username = ev.actor_id
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
       LEFT JOIN users su ON su.username = s.student_id
       LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
       LEFT JOIN semesters sem ON sem.id = sp.semester_id
       WHERE s.student_id = $1
          OR EXISTS (
            SELECT 1 FROM submission_authors sa_vis
            WHERE sa_vis.submission_id = s.id AND sa_vis.user_id = $2
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
                JOIN users u ON u.username = sa.user_id
                WHERE sa.submission_id = s.id
              ), s.author) AS author,
              COALESCE((
                SELECT string_agg(rv.display_name, '; ' ORDER BY r.sort_order)
                FROM reviews r
                JOIN users rv ON rv.username = r.reviewer_id
                WHERE r.submission_id = s.id
              ), s.reviewer) AS reviewer,
              s.abstract,
              s.keywords,
              s.university_name,
              COALESCE(NULLIF(s.faculty_name, ''), f.name) AS faculty_name,
              COALESCE(NULLIF(s.semester_name, ''), sem.name) AS semester_name,
              s.submission_period_id,
              sp.name AS period_name,
              sp.closes_at AS period_closes_at,
              sp.semester_id::text AS semester_id,
              sem.faculty_id::text AS faculty_id,
              ${THESIS_METADATA_SELECT},
              s.status,
              s.created_at,
              s.student_id AS submitter_id,
              COALESCE(su.display_name, su.username) AS submitter,
              su.username AS submitter_username,
              s.author AS author_snapshot,
              s.reviewer AS reviewer_snapshot,
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
                  json_agg(r_vis.reviewer_id::text ORDER BY r_vis.sort_order),
                  '[]'::json
                )
                FROM reviews r_vis
                WHERE r_vis.submission_id = s.id
              ) AS reviewer_user_ids,
              (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'reviewerId', r2.reviewer_id,
                      'reviewer', COALESCE(u2.display_name, u2.username),
                      'username', u2.username,
                      'decision', r2.decision,
                      'comment', r2.comment,
                      'decidedAt', r2.decided_at,
                      'sortOrder', r2.sort_order
                    )
                    ORDER BY r2.sort_order, COALESCE(u2.display_name, u2.username)
                  ),
                  '[]'::json
                )
                FROM reviews r2
                JOIN users u2 ON u2.username = r2.reviewer_id
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
                LEFT JOIN users u3 ON u3.username = ev.actor_id
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
       LEFT JOIN users su ON su.username = s.student_id
       LEFT JOIN submission_periods sp ON sp.id = s.submission_period_id
       LEFT JOIN semesters sem ON sem.id = sp.semester_id
       LEFT JOIN faculties f ON f.id = sem.faculty_id
       ORDER BY s.created_at DESC`
    );

    return result.rows;
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

    if (user.role === "library_staff" || user.role === "director" || user.role === "admin") {
      // allowed
    } else if (user.role === "student") {
      const accessResult = await this.db.query(
        `SELECT 1
         FROM submissions s
         WHERE s.id = $1::uuid
           AND (
             s.student_id = $2
             OR EXISTS (
               SELECT 1
               FROM submission_authors sa
               WHERE sa.submission_id = s.id
                 AND sa.user_id = $2
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
         FROM reviews r
         WHERE r.submission_id = $1::uuid AND r.reviewer_id = $2
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
