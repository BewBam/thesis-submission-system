"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_fs_2 = require("node:fs");
const promises_1 = require("node:fs/promises");
const path = require("node:path");
const pg_1 = require("pg");
const submission_periods_service_1 = require("../archive/submission-periods.service");
const users_service_1 = require("../users/users.service");
const db_pool_1 = require("../users/db-pool");
const submission_metadata_1 = require("./submission-metadata");
const submission_limits_1 = require("./submission-limits");
const submission_student_access_1 = require("./submission-student-access");
const uploadsRoot = path.join(process.cwd(), "uploads", "submissions");
const acceptedPdfMimeTypes = ["application/pdf"];
let SubmissionsService = class SubmissionsService {
    constructor(usersService, submissionPeriodsService) {
        this.usersService = usersService;
        this.submissionPeriodsService = submissionPeriodsService;
        this.db = (0, db_pool_1.createPgPool)();
    }
    async assertThesisFileValid(thesisFile) {
        if (!acceptedPdfMimeTypes.includes(thesisFile.mimetype)) {
            throw new common_1.BadRequestException("Thesis file must be a PDF");
        }
        const fileStat = await (0, promises_1.stat)(thesisFile.path);
        if (fileStat.size > submission_limits_1.THESIS_MAX_FILE_SIZE_BYTES) {
            throw new common_1.BadRequestException(`Thesis PDF must be at most ${submission_limits_1.THESIS_MAX_FILE_SIZE_MB} MB`);
        }
    }
    async assertStudentMaySubmit(client, studentId, options = {}) {
        const result = await client.query(`SELECT id::text AS id, status
       FROM submissions
       WHERE student_id = $1 AND status <> 'draft'
       LIMIT 1`, [studentId]);
        const existing = result.rows[0];
        if (!existing) {
            return;
        }
        const { excludeSubmissionId } = options;
        if (excludeSubmissionId && existing.id === excludeSubmissionId) {
            const status = existing.status === "reject" ? "rejected" : existing.status;
            if (status === "rejected" || status === "approved") {
                return;
            }
            throw new common_1.BadRequestException("This thesis has already been submitted and cannot be submitted again unless it was rejected or returned for revision");
        }
        throw new common_1.BadRequestException("You already have a submitted thesis. You may save multiple drafts, but only one thesis can be submitted for review");
    }
    async loadReviewDecisions(client, submissionId) {
        const result = await client.query(`SELECT decision FROM reviews WHERE submission_id = $1::uuid`, [submissionId]);
        return result.rows.map((row) => row.decision);
    }
    async assertStudentSubmissionAction(client, submissionId, studentId, action) {
        const existing = await client.query(`SELECT student_id, status FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`, [submissionId]);
        const row = existing.rows[0];
        if (!row) {
            throw new common_1.NotFoundException("Submission not found");
        }
        (0, submission_student_access_1.assertSubmissionOwnership)(studentId, row.student_id);
        const reviewDecisions = await this.loadReviewDecisions(client, submissionId);
        const capabilities = (0, submission_student_access_1.getStudentSubmissionCapabilities)(row.status, reviewDecisions);
        (0, submission_student_access_1.assertStudentSubmissionCapability)(capabilities, action);
        return { status: row.status };
    }
    rethrowSubmissionLimitError(error) {
        if (error instanceof pg_1.DatabaseError && error.code === "23505") {
            throw new common_1.BadRequestException("You already have a submitted thesis. You may save multiple drafts, but only one thesis can be submitted for review");
        }
        throw error;
    }
    async createSubmission(actor, dto, thesisFile) {
        if (actor.role !== "student") {
            throw new common_1.BadRequestException("Only students can submit theses");
        }
        if (!thesisFile) {
            throw new common_1.BadRequestException("Thesis PDF is required");
        }
        await this.assertThesisFileValid(thesisFile);
        const student = await this.usersService.findById(dto.studentId);
        if (!student || student.role !== "student") {
            throw new common_1.BadRequestException("Invalid student account");
        }
        const meta = (0, submission_metadata_1.normalizeThesisMetadata)(dto, student.username, { required: true });
        const uniqueAuthorIds = Array.from(new Set(dto.authorIds));
        if (uniqueAuthorIds.length === 0) {
            throw new common_1.BadRequestException("At least one author is required");
        }
        const authorUsers = [];
        for (const authorId of uniqueAuthorIds) {
            const authorUser = await this.usersService.findById(authorId);
            if (!authorUser || authorUser.role !== "student") {
                throw new common_1.BadRequestException("Invalid author account");
            }
            authorUsers.push(authorUser);
        }
        if (!uniqueAuthorIds.includes(dto.studentId)) {
            throw new common_1.BadRequestException("Submitting student must be included in authors");
        }
        const authorSnapshot = authorUsers.map((user) => user.displayName || user.username).join("; ");
        const uniqueReviewerIds = Array.from(new Set(dto.reviewerIds));
        if (uniqueReviewerIds.length === 0) {
            throw new common_1.BadRequestException("At least one reviewer is required");
        }
        const reviewerUsers = [];
        for (const reviewerId of uniqueReviewerIds) {
            const reviewerUser = await this.usersService.findById(reviewerId);
            if (!reviewerUser || reviewerUser.role !== "reviewer") {
                throw new common_1.BadRequestException("Invalid reviewer account");
            }
            reviewerUsers.push(reviewerUser);
        }
        const advisorSnapshot = reviewerUsers.map((user) => user.displayName || user.username).join("; ");
        const period = await this.submissionPeriodsService.resolveOpenPeriod(dto.submissionPeriodId);
        const submissionId = (0, node_crypto_1.randomUUID)();
        const targetDirectory = path.join(uploadsRoot, submissionId);
        await (0, promises_1.mkdir)(targetDirectory, { recursive: true });
        const savedFiles = [];
        const thesisFilePath = await this.moveUploadedFile(thesisFile, targetDirectory);
        savedFiles.push({
            id: (0, node_crypto_1.randomUUID)(),
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
                await client.query(`INSERT INTO submissions (
             id, title, author, advisor, abstract, keywords, student_id, advisor_id, status,
             submission_period_id, university_name, faculty_name, semester_name,
             student_email, title_vi, title_en, thesis_advisors, major, thesis_year
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'reviewing', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`, [
                    submissionId,
                    meta.title,
                    authorSnapshot,
                    advisorSnapshot,
                    dto.abstract,
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
                    meta.thesisYear
                ]);
                await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
           VALUES ($1, $2, $3, 'student', 'submitted', $4::jsonb)`, [
                    (0, node_crypto_1.randomUUID)(),
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
                        authorIds: uniqueAuthorIds,
                        reviewerIds: uniqueReviewerIds,
                        submissionPeriodId: period.periodId,
                        universityName: period.universityName,
                        facultyName: period.facultyName,
                        semesterName: period.semesterName
                    })
                ]);
                let sortOrder = 0;
                for (const authorId of uniqueAuthorIds) {
                    await client.query(`INSERT INTO submission_authors (submission_id, user_id, sort_order)
             VALUES ($1, $2, $3)`, [submissionId, authorId, sortOrder]);
                    sortOrder += 1;
                }
                sortOrder = 0;
                for (const reviewerId of uniqueReviewerIds) {
                    await client.query(`INSERT INTO submission_reviewers (submission_id, user_id, sort_order)
             VALUES ($1, $2, $3)`, [submissionId, reviewerId, sortOrder]);
                    sortOrder += 1;
                }
                for (const reviewerId of uniqueReviewerIds) {
                    await client.query(`INSERT INTO reviews (id, submission_id, reviewer_id, status, decision, comment)
             VALUES ($1, $2, $3, 'pending', 'pending', NULL)`, [(0, node_crypto_1.randomUUID)(), submissionId, reviewerId]);
                }
                for (const file of savedFiles) {
                    await client.query(`INSERT INTO submission_files (id, submission_id, file_name, file_url, file_type)
             VALUES ($1, $2, $3, $4, $5)`, [file.id, file.submission_id, file.file_name, file.file_url, file.file_type]);
                }
                await client.query("COMMIT");
            }
            catch (error) {
                await client.query("ROLLBACK");
                this.rethrowSubmissionLimitError(error);
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            const message = error instanceof pg_1.DatabaseError
                ? `${error.message} (code=${error.code})`
                : error instanceof Error
                    ? error.message
                    : "Unknown error";
            throw new common_1.InternalServerErrorException(`Unable to store submission: ${message}`);
        }
        return {
            id: submissionId,
            status: "reviewing"
        };
    }
    async saveDraft(actor, dto, thesisFile) {
        if (actor.role !== "student") {
            throw new common_1.BadRequestException("Only students can save drafts");
        }
        if (actor.sub !== dto.studentId) {
            throw new common_1.ForbiddenException("Students can only save drafts for themselves");
        }
        if (thesisFile) {
            await this.assertThesisFileValid(thesisFile);
        }
        const student = await this.usersService.findById(dto.studentId);
        if (!student || student.role !== "student") {
            throw new common_1.BadRequestException("Invalid student account");
        }
        const meta = (0, submission_metadata_1.normalizeThesisMetadata)(dto, student.username, { required: false });
        const { authorIds, authorSnapshot, reviewerIds, advisorSnapshot } = await this.resolveAuthorsAndReviewers(dto.studentId, dto.authorIds, dto.reviewerIds, { reviewersRequired: false });
        let periodContext = null;
        if (dto.submissionPeriodId) {
            periodContext = await this.submissionPeriodsService.resolveOpenPeriod(dto.submissionPeriodId);
        }
        const submissionId = (0, node_crypto_1.randomUUID)();
        const targetDirectory = path.join(uploadsRoot, submissionId);
        await (0, promises_1.mkdir)(targetDirectory, { recursive: true });
        const abstract = dto.abstract?.trim() || "";
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            await client.query(`INSERT INTO submissions (
           id, title, author, advisor, abstract, keywords, student_id, advisor_id, status,
           submission_period_id, university_name, faculty_name, semester_name,
           student_email, title_vi, title_en, thesis_advisors, major, thesis_year
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'draft', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`, [
                submissionId,
                meta.title,
                authorSnapshot,
                advisorSnapshot,
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
                meta.thesisYear
            ]);
            await this.replaceAuthors(client, submissionId, authorIds);
            await this.replaceReviewers(client, submissionId, reviewerIds);
            if (thesisFile) {
                await this.replaceThesisFile(client, submissionId, thesisFile, targetDirectory);
            }
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'student', 'draft_saved', $4::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
                submissionId,
                actor.sub,
                JSON.stringify({
                    title: meta.title,
                    submissionPeriodId: periodContext?.periodId ?? null
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
        return { id: submissionId, status: "draft" };
    }
    async updateDraft(actor, submissionId, dto, thesisFile) {
        if (actor.role !== "student") {
            throw new common_1.ForbiddenException();
        }
        if (thesisFile) {
            await this.assertThesisFileValid(thesisFile);
        }
        const client = await this.db.connect();
        let currentStatus = "draft";
        try {
            await client.query("BEGIN");
            const existing = await client.query(`SELECT student_id, status, submission_period_id, title, abstract,
                student_email, title_vi, title_en, thesis_advisors, major, thesis_year
         FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`, [submissionId]);
            const row = existing.rows[0];
            if (!row) {
                throw new common_1.NotFoundException("Submission not found");
            }
            currentStatus = row.status;
            await this.assertStudentSubmissionAction(client, submissionId, actor.sub, "edit");
            const student = await this.usersService.findById(row.student_id);
            if (!student) {
                throw new common_1.BadRequestException("Invalid student account");
            }
            const meta = (0, submission_metadata_1.mergeThesisMetadata)(dto, student.username, {
                email: row.student_email,
                titleVi: row.title_vi,
                titleEn: row.title_en || row.title,
                title: row.title,
                thesisAdvisors: row.thesis_advisors,
                major: row.major,
                thesisYear: row.thesis_year
            }, { required: false });
            const { authorIds, authorSnapshot, reviewerIds, advisorSnapshot } = await this.resolveAuthorsAndReviewers(row.student_id, dto.authorIds, dto.reviewerIds, { reviewersRequired: false });
            let periodContext = null;
            const periodId = dto.submissionPeriodId ?? row.submission_period_id;
            if (periodId) {
                if (row.status === "draft") {
                    periodContext = await this.submissionPeriodsService.resolveOpenPeriod(periodId);
                }
                else {
                    const periodCheck = await client.query(`SELECT 1 FROM submission_periods WHERE id = $1::uuid LIMIT 1`, [periodId]);
                    if (!periodCheck.rows[0]) {
                        throw new common_1.BadRequestException("Submission period not found");
                    }
                    const periodMeta = await this.submissionPeriodsService.resolveOpenPeriod(periodId).catch(() => null);
                    if (periodMeta) {
                        periodContext = periodMeta;
                    }
                    else {
                        const meta = await client.query(`SELECT u.name AS university_name, f.name AS faculty_name, s.name AS semester_name
               FROM submission_periods sp
               JOIN faculties f ON f.id = sp.faculty_id
               JOIN semesters s ON s.id = sp.semester_id
               JOIN universities u ON u.id = f.university_id
               WHERE sp.id = $1::uuid
               LIMIT 1`, [periodId]);
                        const m = meta.rows[0];
                        periodContext = m
                            ? {
                                periodId,
                                periodName: "",
                                facultyId: "",
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
            const abstract = dto.abstract?.trim() ?? row.abstract ?? "";
            await client.query(`UPDATE submissions
         SET title = $1,
             author = $2,
             advisor = $3,
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
             thesis_year = $14
         WHERE id = $15::uuid`, [
                meta.title,
                authorSnapshot,
                advisorSnapshot,
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
                submissionId
            ]);
            await this.replaceAuthors(client, submissionId, authorIds);
            await this.replaceReviewers(client, submissionId, reviewerIds);
            if (thesisFile) {
                const targetDirectory = path.join(uploadsRoot, submissionId);
                await (0, promises_1.mkdir)(targetDirectory, { recursive: true });
                await this.replaceThesisFile(client, submissionId, thesisFile, targetDirectory);
            }
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'student', 'draft_updated', $4::jsonb)`, [(0, node_crypto_1.randomUUID)(), submissionId, actor.sub, JSON.stringify({ title: meta.title })]);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
        return { id: submissionId, status: currentStatus };
    }
    async submitSubmission(actor, submissionId, dto, thesisFile) {
        if (actor.role !== "student") {
            throw new common_1.ForbiddenException();
        }
        if (thesisFile) {
            await this.assertThesisFileValid(thesisFile);
        }
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query(`SELECT student_id, status, submission_period_id, title, abstract,
                student_email, title_vi, title_en, thesis_advisors, major, thesis_year
         FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`, [submissionId]);
            const row = existing.rows[0];
            if (!row) {
                throw new common_1.NotFoundException("Submission not found");
            }
            if (row.student_id !== actor.sub) {
                throw new common_1.ForbiddenException("Students can only submit their own thesis");
            }
            await this.assertStudentSubmissionAction(client, submissionId, actor.sub, "submit");
            if (row.status === "draft") {
                await this.assertStudentMaySubmit(client, row.student_id);
            }
            else {
                await this.assertStudentMaySubmit(client, row.student_id, {
                    excludeSubmissionId: submissionId
                });
            }
            const student = await this.usersService.findById(row.student_id);
            if (!student) {
                throw new common_1.BadRequestException("Invalid student account");
            }
            const meta = (0, submission_metadata_1.mergeThesisMetadata)(dto, student.username, {
                email: row.student_email,
                titleVi: row.title_vi,
                titleEn: row.title_en || row.title,
                title: row.title,
                thesisAdvisors: row.thesis_advisors,
                major: row.major,
                thesisYear: row.thesis_year
            }, { required: true });
            const abstract = dto.abstract?.trim() || row.abstract;
            if (!abstract?.trim()) {
                throw new common_1.BadRequestException("Abstract is required");
            }
            const periodId = dto.submissionPeriodId ?? row.submission_period_id;
            if (!periodId) {
                throw new common_1.BadRequestException("Submission period is required");
            }
            let periodContext;
            if (row.status === "draft") {
                periodContext = await this.submissionPeriodsService.resolveOpenPeriod(periodId);
            }
            else if (row.status === "rejected" || row.status === "reject" || row.status === "approved") {
                const meta = await client.query(`SELECT u.name AS university_name, f.name AS faculty_name, s.name AS semester_name
           FROM submission_periods sp
           JOIN faculties f ON f.id = sp.faculty_id
           JOIN semesters s ON s.id = sp.semester_id
           JOIN universities u ON u.id = f.university_id
           WHERE sp.id = $1::uuid
           LIMIT 1`, [periodId]);
                const m = meta.rows[0];
                if (!m) {
                    throw new common_1.BadRequestException("Submission period not found");
                }
                periodContext = {
                    periodId,
                    periodName: "",
                    facultyId: "",
                    facultyCode: "",
                    facultyName: m.faculty_name,
                    semesterId: "",
                    semesterCode: "",
                    semesterName: m.semester_name,
                    universityId: "",
                    universityName: m.university_name,
                    allowResubmit: true
                };
            }
            else {
                throw new common_1.BadRequestException("This thesis cannot be submitted in its current state");
            }
            const { authorIds, authorSnapshot, reviewerIds, advisorSnapshot } = await this.resolveAuthorsAndReviewers(row.student_id, dto.authorIds, dto.reviewerIds, { reviewersRequired: true });
            const thesisExists = await client.query(`SELECT 1 FROM submission_files WHERE submission_id = $1::uuid AND file_type = 'thesis' LIMIT 1`, [submissionId]);
            if (!thesisExists.rows[0] && !thesisFile) {
                throw new common_1.BadRequestException("Thesis PDF is required");
            }
            await client.query(`UPDATE submissions
         SET title = $1,
             author = $2,
             advisor = $3,
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
             thesis_year = $14
         WHERE id = $15::uuid`, [
                meta.title,
                authorSnapshot,
                advisorSnapshot,
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
                submissionId
            ]);
            await this.replaceAuthors(client, submissionId, authorIds);
            await this.replaceReviewers(client, submissionId, reviewerIds);
            if (thesisFile) {
                const targetDirectory = path.join(uploadsRoot, submissionId);
                await (0, promises_1.mkdir)(targetDirectory, { recursive: true });
                await this.replaceThesisFile(client, submissionId, thesisFile, targetDirectory);
            }
            await client.query(`DELETE FROM reviews WHERE submission_id = $1::uuid`, [submissionId]);
            for (const reviewerId of reviewerIds) {
                await client.query(`INSERT INTO reviews (id, submission_id, reviewer_id, status, decision, comment)
           VALUES ($1, $2, $3, 'pending', 'pending', NULL)`, [(0, node_crypto_1.randomUUID)(), submissionId, reviewerId]);
            }
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'student', 'submitted', $4::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
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
                    fromStatus: row.status
                })
            ]);
            await client.query("COMMIT");
        }
        catch (error) {
            await client.query("ROLLBACK");
            this.rethrowSubmissionLimitError(error);
        }
        finally {
            client.release();
        }
        return { id: submissionId, status: "reviewing" };
    }
    async deleteSubmission(actor, submissionId) {
        if (actor.role !== "student") {
            throw new common_1.ForbiddenException();
        }
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            await this.assertStudentSubmissionAction(client, submissionId, actor.sub, "delete");
            const files = await client.query(`SELECT file_url FROM submission_files WHERE submission_id = $1::uuid`, [submissionId]);
            await client.query(`DELETE FROM submissions WHERE id = $1::uuid`, [submissionId]);
            await client.query("COMMIT");
            for (const file of files.rows) {
                await this.deleteFileSilently(file.file_url);
            }
            try {
                await (0, promises_1.unlink)(path.join(uploadsRoot, submissionId));
            }
            catch {
            }
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
    async revertSubmissionToDraft(actor, submissionId) {
        if (actor.role !== "student") {
            throw new common_1.ForbiddenException();
        }
        const client = await this.db.connect();
        try {
            await client.query("BEGIN");
            const { status } = await this.assertStudentSubmissionAction(client, submissionId, actor.sub, "revert_draft");
            await client.query(`UPDATE submissions SET status = 'draft' WHERE id = $1::uuid`, [submissionId]);
            await client.query(`DELETE FROM reviews WHERE submission_id = $1::uuid`, [submissionId]);
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'student', 'reverted_to_draft', $4::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
                submissionId,
                actor.sub,
                JSON.stringify({ fromStatus: status })
            ]);
            await client.query(`INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload)
         VALUES ($1, $2, $3, 'system', 'status_changed', $4::jsonb)`, [
                (0, node_crypto_1.randomUUID)(),
                submissionId,
                actor.sub,
                JSON.stringify({ from: status, to: "draft", reason: "student_reverted_to_draft" })
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
        return { id: submissionId, status: "draft" };
    }
    async resolveAuthorsAndReviewers(studentId, authorIdsInput, reviewerIdsInput, options) {
        const uniqueAuthorIds = Array.from(new Set(authorIdsInput ?? [studentId]));
        if (uniqueAuthorIds.length === 0) {
            throw new common_1.BadRequestException("At least one author is required");
        }
        const authorUsers = [];
        for (const authorId of uniqueAuthorIds) {
            const authorUser = await this.usersService.findById(authorId);
            if (!authorUser || authorUser.role !== "student") {
                throw new common_1.BadRequestException("Invalid author account");
            }
            authorUsers.push(authorUser);
        }
        if (!uniqueAuthorIds.includes(studentId)) {
            throw new common_1.BadRequestException("Submitting student must be included in authors");
        }
        const uniqueReviewerIds = Array.from(new Set(reviewerIdsInput ?? []));
        if (options.reviewersRequired && uniqueReviewerIds.length === 0) {
            throw new common_1.BadRequestException("At least one reviewer is required");
        }
        const reviewerUsers = [];
        for (const reviewerId of uniqueReviewerIds) {
            const reviewerUser = await this.usersService.findById(reviewerId);
            if (!reviewerUser || reviewerUser.role !== "reviewer") {
                throw new common_1.BadRequestException("Invalid reviewer account");
            }
            reviewerUsers.push(reviewerUser);
        }
        return {
            authorIds: uniqueAuthorIds,
            authorSnapshot: authorUsers.map((user) => user.displayName || user.username).join("; "),
            reviewerIds: uniqueReviewerIds,
            advisorSnapshot: reviewerUsers.map((user) => user.displayName || user.username).join("; ")
        };
    }
    async replaceAuthors(client, submissionId, authorIds) {
        await client.query(`DELETE FROM submission_authors WHERE submission_id = $1::uuid`, [submissionId]);
        let sortOrder = 0;
        for (const authorId of authorIds) {
            await client.query(`INSERT INTO submission_authors (submission_id, user_id, sort_order) VALUES ($1::uuid, $2, $3)`, [submissionId, authorId, sortOrder]);
            sortOrder += 1;
        }
    }
    async replaceReviewers(client, submissionId, reviewerIds) {
        await client.query(`DELETE FROM submission_reviewers WHERE submission_id = $1::uuid`, [submissionId]);
        let sortOrder = 0;
        for (const reviewerId of reviewerIds) {
            await client.query(`INSERT INTO submission_reviewers (submission_id, user_id, sort_order) VALUES ($1::uuid, $2, $3)`, [submissionId, reviewerId, sortOrder]);
            sortOrder += 1;
        }
    }
    async replaceThesisFile(client, submissionId, thesisFile, targetDirectory) {
        const oldThesis = await client.query(`SELECT file_url FROM submission_files WHERE submission_id = $1::uuid AND file_type = 'thesis'`, [submissionId]);
        await client.query(`DELETE FROM submission_files WHERE submission_id = $1::uuid AND file_type = 'thesis'`, [
            submissionId
        ]);
        for (const file of oldThesis.rows) {
            await this.deleteFileSilently(file.file_url);
        }
        const thesisPath = await this.moveUploadedFile(thesisFile, targetDirectory);
        await client.query(`INSERT INTO submission_files (id, submission_id, file_name, file_url, file_type)
       VALUES ($1, $2::uuid, $3, $4, 'thesis')`, [(0, node_crypto_1.randomUUID)(), submissionId, thesisFile.originalname, thesisPath]);
    }
    async getStudentSubmissions(studentId) {
        const result = await this.db.query(`SELECT s.id,
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
              s.university_name,
              s.faculty_name,
              s.semester_name,
              s.submission_period_id,
              ${submission_metadata_1.THESIS_METADATA_SELECT},
              s.status,
              s.created_at,
              COALESCE((
                SELECT json_agg(sa_vis.user_id::text ORDER BY sa_vis.sort_order)
                FROM submission_authors sa_vis
                WHERE sa_vis.submission_id = s.id
              ), '[]'::json) AS author_user_ids,
              COALESCE((
                SELECT json_agg(sr_vis.user_id::text ORDER BY sr_vis.sort_order)
                FROM submission_reviewers sr_vis
                WHERE sr_vis.submission_id = s.id
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
       ORDER BY s.created_at DESC`, [studentId, studentId]);
        return result.rows;
    }
    async getAllSubmissions() {
        const result = await this.db.query(`SELECT s.id,
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
              s.university_name,
              s.faculty_name,
              s.semester_name,
              ${submission_metadata_1.THESIS_METADATA_SELECT},
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
       ORDER BY s.created_at DESC`);
        return result.rows;
    }
    async getSubmissionFileStream(user, submissionId, fileId) {
        const result = await this.db.query(`SELECT sf.file_name, sf.file_url, sf.file_type
       FROM submission_files sf
       WHERE sf.id = $1::uuid AND sf.submission_id = $2::uuid
       LIMIT 1`, [fileId, submissionId]);
        if (result.rowCount === 0) {
            throw new common_1.NotFoundException("File not found");
        }
        const row = result.rows[0];
        if (user.role === "library_staff" || user.role === "director") {
        }
        else if (user.role === "student") {
            const accessResult = await this.db.query(`SELECT 1
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
         LIMIT 1`, [submissionId, user.sub]);
            if (accessResult.rowCount === 0) {
                throw new common_1.ForbiddenException("You are not allowed to access this submission file");
            }
        }
        else if (user.role === "reviewer") {
            const accessResult = await this.db.query(`SELECT 1
         FROM submission_reviewers sr
         WHERE sr.submission_id = $1::uuid AND sr.user_id = $2::uuid
         UNION
         SELECT 1
         FROM reviews r
         WHERE r.submission_id = $1::uuid AND r.reviewer_id = $2::uuid
         LIMIT 1`, [submissionId, user.sub]);
            if (accessResult.rowCount === 0) {
                throw new common_1.ForbiddenException("You are not assigned to this submission");
            }
        }
        else {
            throw new common_1.ForbiddenException();
        }
        this.assertResolvedFilePathUnderSubmission(row.file_url, submissionId);
        try {
            await (0, promises_1.access)(row.file_url, node_fs_2.constants.R_OK);
        }
        catch {
            throw new common_1.NotFoundException("File missing on server");
        }
        const contentType = this.contentTypeForFileName(row.file_name);
        const stream = (0, node_fs_1.createReadStream)(row.file_url);
        return {
            stream,
            contentType,
            fileName: row.file_name
        };
    }
    contentTypeForFileName(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const map = {
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
    assertResolvedFilePathUnderSubmission(fileUrl, submissionId) {
        const submissionDir = path.resolve(path.join(uploadsRoot, submissionId));
        const resolvedFile = path.resolve(fileUrl);
        const relative = path.relative(submissionDir, resolvedFile);
        if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new common_1.ForbiddenException();
        }
    }
    async moveUploadedFile(file, destinationDir) {
        const normalizedName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
        const destination = path.join(destinationDir, normalizedName);
        await (0, promises_1.rename)(file.path, destination);
        return destination;
    }
    async deleteFileSilently(filePath) {
        try {
            await (0, promises_1.unlink)(filePath);
        }
        catch {
        }
    }
};
exports.SubmissionsService = SubmissionsService;
exports.SubmissionsService = SubmissionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        submission_periods_service_1.SubmissionPeriodsService])
], SubmissionsService);
//# sourceMappingURL=submissions.service.js.map