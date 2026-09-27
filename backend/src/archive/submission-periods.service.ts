import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";

const HCMUT_NAME = "Trường Đại học Bách khoa TP.HCM";

export type OpenPeriodContext = {
  periodId: string;
  periodName: string;
  facultyId: string;
  facultyCode: string;
  facultyName: string;
  semesterId: string;
  semesterCode: string;
  semesterName: string;
  universityId: string;
  universityName: string;
  allowResubmit: boolean;
};

@Injectable()
export class SubmissionPeriodsService {
  private readonly db = createPgPool();

  private openPeriodFilter() {
    return `sp.status = 'open' AND NOW() >= sp.opens_at AND NOW() <= sp.closes_at`;
  }

  async listFacultiesWithOpenPeriods() {
    const result = await this.db.query(
      `SELECT DISTINCT f.id, f.name
       FROM faculties f
       JOIN semesters s ON s.faculty_id = f.id
       JOIN submission_periods sp ON sp.semester_id = s.id
       WHERE f.status = 'active'
         AND ${this.openPeriodFilter()}
       ORDER BY f.name ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      universityName: HCMUT_NAME
    }));
  }

  async listSemestersWithOpenPeriods(facultyId: string) {
    const result = await this.db.query(
      `SELECT DISTINCT s.id,
              s.name,
              f.id AS faculty_id,
              f.name AS faculty_name
       FROM semesters s
       JOIN faculties f ON f.id = s.faculty_id
       JOIN submission_periods sp ON sp.semester_id = s.id
       WHERE s.faculty_id = $1::uuid
         AND s.status = 'active'
         AND f.status = 'active'
         AND ${this.openPeriodFilter()}
       ORDER BY s.name ASC`,
      [facultyId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      facultyId: row.faculty_id,
      facultyName: row.faculty_name,
      universityName: HCMUT_NAME
    }));
  }

  async listOpenPeriods(facultyId: string, semesterId: string) {
    const result = await this.db.query(
      `SELECT sp.id,
              sp.name,
              sp.opens_at,
              sp.closes_at,
              sp.allow_resubmit,
              f.id AS faculty_id,
              f.name AS faculty_name,
              s.id AS semester_id,
              s.name AS semester_name
       FROM submission_periods sp
       JOIN semesters s ON s.id = sp.semester_id
       JOIN faculties f ON f.id = s.faculty_id
       WHERE s.faculty_id = $1::uuid
         AND sp.semester_id = $2::uuid
         AND ${this.openPeriodFilter()}
       ORDER BY sp.opens_at DESC`,
      [facultyId, semesterId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      allowResubmit: row.allow_resubmit,
      facultyId: row.faculty_id,
      facultyCode: "",
      facultyName: row.faculty_name,
      semesterId: row.semester_id,
      semesterCode: "",
      semesterName: row.semester_name,
      universityId: "",
      universityName: HCMUT_NAME
    }));
  }

  async resolveOpenPeriod(periodId: string): Promise<OpenPeriodContext> {
    const result = await this.db.query(
      `SELECT sp.id,
              sp.name AS period_name,
              sp.allow_resubmit,
              f.id AS faculty_id,
              f.name AS faculty_name,
              s.id AS semester_id,
              s.name AS semester_name
       FROM submission_periods sp
       JOIN semesters s ON s.id = sp.semester_id
       JOIN faculties f ON f.id = s.faculty_id
       WHERE sp.id = $1::uuid
         AND ${this.openPeriodFilter()}
       LIMIT 1`,
      [periodId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new BadRequestException("Submission period is not open or does not exist");
    }
    return {
      periodId: row.id,
      periodName: row.period_name,
      facultyId: row.faculty_id,
      facultyCode: "",
      facultyName: row.faculty_name,
      semesterId: row.semester_id,
      semesterCode: "",
      semesterName: row.semester_name,
      universityId: "",
      universityName: HCMUT_NAME,
      allowResubmit: row.allow_resubmit
    };
  }

  async assertPeriodAllowsResubmit(periodId: string | null) {
    if (!periodId) {
      return;
    }
    const result = await this.db.query<{ allow_resubmit: boolean; status: string }>(
      `SELECT allow_resubmit, status FROM submission_periods WHERE id = $1::uuid LIMIT 1`,
      [periodId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Submission period not found");
    }
    if (!row.allow_resubmit) {
      throw new BadRequestException("Resubmission is not allowed for this submission period");
    }
    if (row.status !== "open") {
      throw new BadRequestException("Submission period is closed");
    }
  }
}
