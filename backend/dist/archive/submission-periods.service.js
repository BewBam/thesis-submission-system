"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionPeriodsService = void 0;
const common_1 = require("@nestjs/common");
const db_pool_1 = require("../users/db-pool");
let SubmissionPeriodsService = class SubmissionPeriodsService {
    constructor() {
        this.db = (0, db_pool_1.createPgPool)();
    }
    openPeriodFilter() {
        return `sp.status = 'open' AND NOW() >= sp.opens_at AND NOW() <= sp.closes_at`;
    }
    async listFacultiesWithOpenPeriods() {
        const result = await this.db.query(`SELECT DISTINCT f.id,
              f.code,
              f.name,
              u.id AS university_id,
              u.name AS university_name
       FROM faculties f
       JOIN universities u ON u.id = f.university_id
       JOIN submission_periods sp ON sp.faculty_id = f.id
       WHERE f.status = 'active'
         AND u.status = 'active'
         AND ${this.openPeriodFilter()}
       ORDER BY f.name ASC`);
        return result.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            universityId: row.university_id,
            universityName: row.university_name
        }));
    }
    async listSemestersWithOpenPeriods(facultyId) {
        const result = await this.db.query(`SELECT DISTINCT s.id,
              s.code,
              s.name,
              f.id AS faculty_id,
              f.name AS faculty_name,
              u.name AS university_name
       FROM semesters s
       JOIN faculties f ON f.id = s.faculty_id
       JOIN universities u ON u.id = f.university_id
       JOIN submission_periods sp ON sp.semester_id = s.id AND sp.faculty_id = f.id
       WHERE s.faculty_id = $1::uuid
         AND s.status = 'active'
         AND f.status = 'active'
         AND ${this.openPeriodFilter()}
       ORDER BY s.code DESC`, [facultyId]);
        return result.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            facultyId: row.faculty_id,
            facultyName: row.faculty_name,
            universityName: row.university_name
        }));
    }
    async listOpenPeriods(facultyId, semesterId) {
        const result = await this.db.query(`SELECT sp.id,
              sp.name,
              sp.opens_at,
              sp.closes_at,
              sp.allow_resubmit,
              f.id AS faculty_id,
              f.code AS faculty_code,
              f.name AS faculty_name,
              s.id AS semester_id,
              s.code AS semester_code,
              s.name AS semester_name,
              u.id AS university_id,
              u.name AS university_name
       FROM submission_periods sp
       JOIN faculties f ON f.id = sp.faculty_id
       JOIN semesters s ON s.id = sp.semester_id
       JOIN universities u ON u.id = f.university_id
       WHERE sp.faculty_id = $1::uuid
         AND sp.semester_id = $2::uuid
         AND ${this.openPeriodFilter()}
       ORDER BY sp.opens_at DESC`, [facultyId, semesterId]);
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            opensAt: row.opens_at,
            closesAt: row.closes_at,
            allowResubmit: row.allow_resubmit,
            facultyId: row.faculty_id,
            facultyCode: row.faculty_code,
            facultyName: row.faculty_name,
            semesterId: row.semester_id,
            semesterCode: row.semester_code,
            semesterName: row.semester_name,
            universityId: row.university_id,
            universityName: row.university_name
        }));
    }
    async resolveOpenPeriod(periodId) {
        const result = await this.db.query(`SELECT sp.id,
              sp.name AS period_name,
              sp.allow_resubmit,
              f.id AS faculty_id,
              f.code AS faculty_code,
              f.name AS faculty_name,
              s.id AS semester_id,
              s.code AS semester_code,
              s.name AS semester_name,
              u.id AS university_id,
              u.name AS university_name
       FROM submission_periods sp
       JOIN faculties f ON f.id = sp.faculty_id
       JOIN semesters s ON s.id = sp.semester_id
       JOIN universities u ON u.id = f.university_id
       WHERE sp.id = $1::uuid
         AND ${this.openPeriodFilter()}
       LIMIT 1`, [periodId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.BadRequestException("Submission period is not open or does not exist");
        }
        return {
            periodId: row.id,
            periodName: row.period_name,
            facultyId: row.faculty_id,
            facultyCode: row.faculty_code,
            facultyName: row.faculty_name,
            semesterId: row.semester_id,
            semesterCode: row.semester_code,
            semesterName: row.semester_name,
            universityId: row.university_id,
            universityName: row.university_name,
            allowResubmit: row.allow_resubmit
        };
    }
    async assertPeriodAllowsResubmit(periodId) {
        if (!periodId) {
            return;
        }
        const result = await this.db.query(`SELECT allow_resubmit, status FROM submission_periods WHERE id = $1::uuid LIMIT 1`, [periodId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException("Submission period not found");
        }
        if (!row.allow_resubmit) {
            throw new common_1.BadRequestException("Resubmission is not allowed for this submission period");
        }
        if (row.status !== "open") {
            throw new common_1.BadRequestException("Submission period is closed");
        }
    }
};
exports.SubmissionPeriodsService = SubmissionPeriodsService;
exports.SubmissionPeriodsService = SubmissionPeriodsService = __decorate([
    (0, common_1.Injectable)()
], SubmissionPeriodsService);
//# sourceMappingURL=submission-periods.service.js.map