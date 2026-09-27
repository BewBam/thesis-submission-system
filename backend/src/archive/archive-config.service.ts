import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtPayload } from "../auth/jwt.strategy";
import { createPgPool } from "../users/db-pool";
import { CreateFacultyDto } from "./dto/create-faculty.dto";
import { CreateSemesterDto } from "./dto/create-semester.dto";
import { CreateSubmissionPeriodDto } from "./dto/create-submission-period.dto";
import { UpdateFacultyDto } from "./dto/update-faculty.dto";
import { UpdateSemesterDto } from "./dto/update-semester.dto";
import { UpdateSubmissionPeriodDto } from "./dto/update-submission-period.dto";
import { DspaceProvisionerService } from "./dspace-provisioner.service";

@Injectable()
export class ArchiveConfigService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(ArchiveConfigService.name);

  constructor(private readonly dspaceProvisioner: DspaceProvisionerService) {}

  async listFaculties() {
    const result = await this.db.query(
      `SELECT f.id,
              f.name,
              f.status,
              f.created_at,
              f.updated_at,
              (SELECT COUNT(*)::int FROM semesters s WHERE s.faculty_id = f.id) AS semester_count,
              (SELECT COUNT(*)::int
               FROM submission_periods sp
               JOIN semesters ps ON ps.id = sp.semester_id
               WHERE ps.faculty_id = f.id) AS period_count,
              (SELECT COUNT(*)::int
               FROM submission_periods sp
               JOIN semesters ps ON ps.id = sp.semester_id
               WHERE ps.faculty_id = f.id AND sp.status = 'open') AS open_period_count
       FROM faculties f
       ORDER BY f.name ASC`
    );
    return result.rows.map((row) => this.mapFaculty(row));
  }

  async createFaculty(user: JwtPayload, dto: CreateFacultyDto) {
    const facultyId = randomUUID();
    await this.db.query(
      `INSERT INTO faculties (id, name, status, created_by)
       VALUES ($1::uuid, $2, 'active', $3)`,
      [facultyId, dto.name.trim(), user.sub]
    );

    return this.getFacultyById(facultyId);
  }

  async getFacultyDetail(facultyId: string) {
    const base = await this.getFacultyById(facultyId);
    const stats = await this.db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM semesters s WHERE s.faculty_id = $1::uuid) AS semester_count,
         (SELECT COUNT(*)::int
          FROM submission_periods sp
          JOIN semesters ps ON ps.id = sp.semester_id
          WHERE ps.faculty_id = $1::uuid) AS period_count,
         (SELECT COUNT(*)::int
          FROM submissions sub
          JOIN submission_periods sp ON sp.id = sub.submission_period_id
          JOIN semesters ps ON ps.id = sp.semester_id
          WHERE ps.faculty_id = $1::uuid) AS submission_count`,
      [facultyId]
    );
    const row = stats.rows[0] || {};
    return {
      ...base,
      semesterCount: row.semester_count ?? base.semesterCount ?? 0,
      periodCount: row.period_count ?? 0,
      submissionCount: row.submission_count ?? 0
    };
  }

  async updateFaculty(facultyId: string, dto: UpdateFacultyDto) {
    const existing = await this.getFacultyRow(facultyId);
    if (dto.name !== undefined) {
      await this.db.query(`UPDATE faculties SET name = $1, updated_at = NOW() WHERE id = $2::uuid`, [
        dto.name.trim(),
        facultyId
      ]);
    }
    if (dto.status !== undefined) {
      await this.db.query(`UPDATE faculties SET status = $1, updated_at = NOW() WHERE id = $2::uuid`, [
        dto.status,
        facultyId
      ]);
    }
    if (!dto.name && !dto.status) {
      return this.mapFaculty(existing);
    }
    return this.getFacultyDetail(facultyId);
  }

  async deleteFaculty(facultyId: string) {
    await this.getFacultyRow(facultyId);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE submissions
         SET submission_period_id = NULL
         WHERE submission_period_id IN (
           SELECT sp.id
           FROM submission_periods sp
           JOIN semesters s ON s.id = sp.semester_id
           WHERE s.faculty_id = $1::uuid
         )`,
        [facultyId]
      );
      await client.query(
        `DELETE FROM submission_periods
         WHERE semester_id IN (SELECT id FROM semesters WHERE faculty_id = $1::uuid)`,
        [facultyId]
      );
      await client.query(`DELETE FROM semesters WHERE faculty_id = $1::uuid`, [facultyId]);
      const assigned = await client.query(
        `SELECT 1 FROM users WHERE faculty_id = $1::uuid AND role IN ('student', 'reviewer') LIMIT 1`,
        [facultyId]
      );
      if (assigned.rows[0]) {
        throw new BadRequestException(
          "This faculty still has student or reviewer accounts. Move those accounts before deleting the faculty."
        );
      }
      await client.query(
        `UPDATE users SET faculty_id = NULL WHERE faculty_id = $1::uuid`,
        [facultyId]
      );
      await client.query(`DELETE FROM faculties WHERE id = $1::uuid`, [facultyId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { deleted: true, id: facultyId };
  }

  async provisionFacultyDspace(facultyId: string) {
    return this.getFacultyById(facultyId);
  }

  async listSemesters(facultyId: string) {
    await this.assertFaculty(facultyId);
    const result = await this.db.query(
      `SELECT s.id,
              s.faculty_id,
              s.name,
              s.status,
              s.created_at,
              (SELECT COUNT(*)::int FROM submission_periods sp WHERE sp.semester_id = s.id) AS period_count
       FROM semesters s
       WHERE s.faculty_id = $1::uuid
       ORDER BY s.name ASC`,
      [facultyId]
    );
    return result.rows.map((row) => this.mapSemester(row));
  }

  async createSemester(user: JwtPayload, facultyId: string, dto: CreateSemesterDto) {
    const faculty = await this.getFacultyRow(facultyId);
    if (faculty.status !== "active") {
      throw new BadRequestException("Faculty is inactive");
    }

    const name = dto.name.trim();
    const dup = await this.db.query(
      `SELECT 1 FROM semesters WHERE faculty_id = $1::uuid AND lower(name) = lower($2) LIMIT 1`,
      [facultyId, name]
    );
    if (dup.rows[0]) {
      throw new ConflictException("Semester name already exists for this faculty");
    }

    const semesterId = randomUUID();
    await this.db.query(
      `INSERT INTO semesters (id, faculty_id, name, status, created_by)
       VALUES ($1::uuid, $2::uuid, $3, 'active', $4)`,
      [semesterId, facultyId, name, user.sub]
    );
    return this.getSemesterById(semesterId);
  }

  async createSemesterForAllFaculties(user: JwtPayload, dto: CreateSemesterDto) {
    const name = dto.name.trim();
    const faculties = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM faculties WHERE status = 'active' ORDER BY name ASC`
    );
    const created: { facultyId: string; facultyName: string; semesterId: string }[] = [];
    const skipped: { facultyId: string; facultyName: string; reason: string }[] = [];

    for (const faculty of faculties.rows) {
      const dup = await this.db.query(
        `SELECT 1 FROM semesters WHERE faculty_id = $1::uuid AND lower(name) = lower($2) LIMIT 1`,
        [faculty.id, name]
      );
      if (dup.rows[0]) {
        skipped.push({ facultyId: faculty.id, facultyName: faculty.name, reason: "already exists" });
        continue;
      }
      const semesterId = randomUUID();
      await this.db.query(
        `INSERT INTO semesters (id, faculty_id, name, status, created_by)
         VALUES ($1::uuid, $2::uuid, $3, 'active', $4)`,
        [semesterId, faculty.id, name, user.sub]
      );
      created.push({ facultyId: faculty.id, facultyName: faculty.name, semesterId });
    }

    return {
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped
    };
  }

  async getSemesterDetail(semesterId: string) {
    const base = await this.getSemesterById(semesterId);
    const stats = await this.db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM submission_periods sp WHERE sp.semester_id = $1::uuid) AS period_count,
         (SELECT COUNT(*)::int
          FROM submissions sub
          JOIN submission_periods sp ON sp.id = sub.submission_period_id
          WHERE sp.semester_id = $1::uuid) AS submission_count`,
      [semesterId]
    );
    const row = stats.rows[0] || {};
    return {
      ...base,
      periodCount: row.period_count ?? 0,
      submissionCount: row.submission_count ?? 0
    };
  }

  async updateSemester(semesterId: string, dto: UpdateSemesterDto) {
    await this.getSemesterById(semesterId);
    if (dto.name !== undefined) {
      await this.db.query(`UPDATE semesters SET name = $1 WHERE id = $2::uuid`, [
        dto.name.trim(),
        semesterId
      ]);
    }
    if (dto.status !== undefined) {
      await this.db.query(`UPDATE semesters SET status = $1 WHERE id = $2::uuid`, [
        dto.status,
        semesterId
      ]);
    }
    return this.getSemesterDetail(semesterId);
  }

  async deleteSemester(semesterId: string) {
    await this.getSemesterById(semesterId);
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE submissions
         SET submission_period_id = NULL
         WHERE submission_period_id IN (
           SELECT id FROM submission_periods WHERE semester_id = $1::uuid
         )`,
        [semesterId]
      );
      await client.query(`DELETE FROM submission_periods WHERE semester_id = $1::uuid`, [semesterId]);
      await client.query(`DELETE FROM semesters WHERE id = $1::uuid`, [semesterId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { deleted: true, id: semesterId };
  }

  async listSubmissionPeriods(facultyId: string) {
    await this.assertFaculty(facultyId);
    const result = await this.db.query(
      `SELECT sp.id,
              s.faculty_id,
              sp.semester_id,
              s.name AS semester_name,
              sp.name,
              sp.opens_at,
              sp.closes_at,
              sp.status,
              sp.allow_resubmit,
              sp.dspace_collection_id,
              sp.created_at,
              sp.updated_at,
              (SELECT COUNT(*)::int FROM submissions sub WHERE sub.submission_period_id = sp.id) AS submission_count
       FROM submission_periods sp
       JOIN semesters s ON s.id = sp.semester_id
       WHERE s.faculty_id = $1::uuid
       ORDER BY sp.opens_at DESC`,
      [facultyId]
    );
    return result.rows.map((row) => this.mapPeriod(row));
  }

  async createSubmissionPeriod(user: JwtPayload, facultyId: string, dto: CreateSubmissionPeriodDto) {
    const faculty = await this.getFacultyRow(facultyId);
    if (faculty.status !== "active") {
      throw new BadRequestException("Faculty is inactive");
    }

    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException("Invalid date range");
    }
    if (opensAt >= closesAt) {
      throw new BadRequestException("opensAt must be before closesAt");
    }

    const semester = await this.db.query<{ faculty_id: string }>(
      `SELECT faculty_id FROM semesters WHERE id = $1::uuid LIMIT 1`,
      [dto.semesterId]
    );
    const sem = semester.rows[0];
    if (!sem) {
      throw new NotFoundException("Semester not found");
    }
    if (sem.faculty_id !== facultyId) {
      throw new BadRequestException("Semester does not belong to this faculty");
    }

    const periodName = dto.name.trim();
    let dspaceCollectionId: string | null = null;
    const root = await this.db.query<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = 'dspace_root_community_id' LIMIT 1`
    );
    const parentCommunityId = root.rows[0]?.value?.trim() || "";
    if (parentCommunityId) {
      const created = await this.dspaceProvisioner.createCollection(parentCommunityId, periodName);
      dspaceCollectionId = created.id;
    }

    const periodId = randomUUID();
    await this.db.query(
      `INSERT INTO submission_periods (
         id, semester_id, name, opens_at, closes_at,
         status, allow_resubmit, dspace_collection_id, created_by
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'draft', $6, $7, $8)`,
      [
        periodId,
        dto.semesterId,
        periodName,
        opensAt.toISOString(),
        closesAt.toISOString(),
        dto.allowResubmit !== false,
        dspaceCollectionId,
        user.sub
      ]
    );
    return this.getPeriodDetail(periodId);
  }

  async getPeriodDetail(periodId: string) {
    const base = await this.getPeriodById(periodId);
    const stats = await this.db.query(
      `SELECT COUNT(*)::int AS submission_count
       FROM submissions WHERE submission_period_id = $1::uuid`,
      [periodId]
    );
    return {
      ...base,
      submissionCount: stats.rows[0]?.submission_count ?? 0
    };
  }

  async updateSubmissionPeriod(periodId: string, dto: UpdateSubmissionPeriodDto) {
    await this.getPeriodRow(periodId);
    const opensAt = dto.opensAt !== undefined ? new Date(dto.opensAt) : null;
    const closesAt = dto.closesAt !== undefined ? new Date(dto.closesAt) : null;
    if (opensAt && Number.isNaN(opensAt.getTime())) {
      throw new BadRequestException("Invalid opensAt");
    }
    if (closesAt && Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException("Invalid closesAt");
    }
    if (opensAt && closesAt && opensAt >= closesAt) {
      throw new BadRequestException("opensAt must be before closesAt");
    }

    if (dto.name !== undefined) {
      await this.db.query(
        `UPDATE submission_periods SET name = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.name.trim(), periodId]
      );
    }
    if (dto.opensAt !== undefined) {
      await this.db.query(
        `UPDATE submission_periods SET opens_at = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [opensAt!.toISOString(), periodId]
      );
    }
    if (dto.closesAt !== undefined) {
      await this.db.query(
        `UPDATE submission_periods SET closes_at = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [closesAt!.toISOString(), periodId]
      );
    }
    if (dto.allowResubmit !== undefined) {
      await this.db.query(
        `UPDATE submission_periods SET allow_resubmit = $1, updated_at = NOW() WHERE id = $2::uuid`,
        [dto.allowResubmit, periodId]
      );
    }

    if (dto.opensAt !== undefined || dto.closesAt !== undefined) {
      const current = await this.getPeriodRow(periodId);
      const open = new Date(current.opens_at);
      const close = new Date(current.closes_at);
      if (open >= close) {
        throw new BadRequestException("opensAt must be before closesAt");
      }
    }

    return this.getPeriodDetail(periodId);
  }

  async deleteSubmissionPeriod(periodId: string) {
    const period = await this.getPeriodRow(periodId);
    let dspaceDeleted = false;
    let dspaceDeleteWarning = false;
    if (period.dspace_collection_id) {
      const ok = await this.dspaceProvisioner.deleteCollection(String(period.dspace_collection_id));
      dspaceDeleted = ok;
      dspaceDeleteWarning = !ok;
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE submissions SET submission_period_id = NULL WHERE submission_period_id = $1::uuid`,
        [periodId]
      );
      await client.query(`DELETE FROM submission_periods WHERE id = $1::uuid`, [periodId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    if (dspaceDeleteWarning) {
      this.logger.warn(`Period ${periodId} removed from Portal but DSpace collection may remain`);
    }
    return { deleted: true, id: periodId, dspaceDeleted, dspaceDeleteWarning };
  }

  async openSubmissionPeriod(periodId: string) {
    const period = await this.getPeriodRow(periodId);
    if (period.status === "open") {
      return this.getPeriodById(periodId);
    }
    if (period.status !== "draft" && period.status !== "closed") {
      throw new BadRequestException(`Cannot open period in status ${period.status}`);
    }

    await this.db.query(
      `UPDATE submission_periods SET status = 'open', updated_at = NOW() WHERE id = $1::uuid`,
      [periodId]
    );
    return this.getPeriodById(periodId);
  }

  async closeSubmissionPeriod(periodId: string) {
    const period = await this.getPeriodRow(periodId);
    if (period.status === "closed" || period.status === "archived") {
      return this.getPeriodById(periodId);
    }
    if (period.status !== "open" && period.status !== "draft") {
      throw new BadRequestException(`Cannot close period in status ${period.status}`);
    }
    await this.db.query(
      `UPDATE submission_periods SET status = 'closed', updated_at = NOW() WHERE id = $1::uuid`,
      [periodId]
    );
    return this.getPeriodById(periodId);
  }

  private async assertFaculty(facultyId: string) {
    const row = await this.db.query(`SELECT 1 FROM faculties WHERE id = $1::uuid LIMIT 1`, [facultyId]);
    if (!row.rows[0]) {
      throw new NotFoundException("Faculty not found");
    }
  }

  private async getFacultyRow(facultyId: string) {
    const result = await this.db.query(
      `SELECT f.id,
              f.name,
              f.status,
              f.created_at,
              f.updated_at
       FROM faculties f
       WHERE f.id = $1::uuid
       LIMIT 1`,
      [facultyId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Faculty not found");
    }
    return row;
  }

  private async getFacultyById(facultyId: string) {
    const result = await this.db.query(
      `SELECT f.id,
              f.name,
              f.status,
              f.created_at,
              f.updated_at,
              (SELECT COUNT(*)::int FROM semesters s WHERE s.faculty_id = f.id) AS semester_count,
              (SELECT COUNT(*)::int
               FROM submission_periods sp
               JOIN semesters ps ON ps.id = sp.semester_id
               WHERE ps.faculty_id = f.id) AS period_count,
              (SELECT COUNT(*)::int
               FROM submission_periods sp
               JOIN semesters ps ON ps.id = sp.semester_id
               WHERE ps.faculty_id = f.id AND sp.status = 'open') AS open_period_count
       FROM faculties f
       WHERE f.id = $1::uuid
       LIMIT 1`,
      [facultyId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Faculty not found");
    }
    return this.mapFaculty(row);
  }

  private async getSemesterById(semesterId: string) {
    const result = await this.db.query(
      `SELECT id, faculty_id, name, status, created_at,
              (SELECT COUNT(*)::int FROM submission_periods sp WHERE sp.semester_id = semesters.id) AS period_count
       FROM semesters WHERE id = $1::uuid LIMIT 1`,
      [semesterId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Semester not found");
    }
    return this.mapSemester(row);
  }

  private async getPeriodRow(periodId: string) {
    const result = await this.db.query(
      `SELECT id, semester_id, name, opens_at, closes_at, status, allow_resubmit, dspace_collection_id
       FROM submission_periods WHERE id = $1::uuid LIMIT 1`,
      [periodId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Submission period not found");
    }
    return row;
  }

  private async getPeriodById(periodId: string) {
    const result = await this.db.query(
      `SELECT sp.id,
              s.faculty_id,
              sp.semester_id,
              s.name AS semester_name,
              sp.name,
              sp.opens_at,
              sp.closes_at,
              sp.status,
              sp.allow_resubmit,
              sp.dspace_collection_id,
              sp.created_at,
              sp.updated_at,
              (SELECT COUNT(*)::int FROM submissions sub WHERE sub.submission_period_id = sp.id) AS submission_count
       FROM submission_periods sp
       JOIN semesters s ON s.id = sp.semester_id
       WHERE sp.id = $1::uuid
       LIMIT 1`,
      [periodId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Submission period not found");
    }
    return this.mapPeriod(row);
  }

  private mapFaculty(row: Record<string, unknown>) {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      semesterCount: row.semester_count ?? 0,
      periodCount: row.period_count ?? 0,
      openPeriodCount: row.open_period_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapSemester(row: Record<string, unknown>) {
    return {
      id: row.id,
      facultyId: row.faculty_id,
      name: row.name,
      status: row.status,
      periodCount: row.period_count ?? 0,
      createdAt: row.created_at
    };
  }

  private mapPeriod(row: Record<string, unknown>) {
    return {
      id: row.id,
      facultyId: row.faculty_id,
      semesterId: row.semester_id,
      semesterCode: "",
      semesterName: row.semester_name,
      name: row.name,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      status: row.status,
      allowResubmit: row.allow_resubmit,
      dspaceCollectionId: row.dspace_collection_id,
      submissionCount: row.submission_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

}
