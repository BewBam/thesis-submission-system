import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { JwtPayload } from "../auth/jwt.strategy";
import { createPgPool } from "../users/db-pool";
import { CreateFacultyDto } from "./dto/create-faculty.dto";
import { CreateSemesterDto } from "./dto/create-semester.dto";
import { CreateSubmissionPeriodDto } from "./dto/create-submission-period.dto";
import { UpdateFacultyDto } from "./dto/update-faculty.dto";
import { DspaceProvisionerService } from "./dspace-provisioner.service";

@Injectable()
export class ArchiveConfigService {
  private readonly db = createPgPool();

  constructor(private readonly dspaceProvisioner: DspaceProvisionerService) {}

  async listUniversities() {
    const result = await this.db.query(
      `SELECT id, code, name, status FROM universities WHERE status = 'active' ORDER BY name ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status
    }));
  }

  async listFaculties() {
    const result = await this.db.query(
      `SELECT f.id,
              f.university_id,
              u.name AS university_name,
              f.code,
              f.name,
              f.status,
              f.dspace_community_id,
              f.dspace_sync_status,
              f.created_at,
              f.updated_at,
              (SELECT COUNT(*)::int FROM semesters s WHERE s.faculty_id = f.id) AS semester_count,
              (SELECT COUNT(*)::int
               FROM submission_periods sp
               WHERE sp.faculty_id = f.id AND sp.status = 'open') AS open_period_count
       FROM faculties f
       JOIN universities u ON u.id = f.university_id
       ORDER BY f.name ASC`
    );
    return result.rows.map((row) => this.mapFaculty(row));
  }

  async createFaculty(user: JwtPayload, dto: CreateFacultyDto) {
    const university = await this.db.query(`SELECT id FROM universities WHERE id = $1::uuid LIMIT 1`, [
      dto.universityId
    ]);
    if (!university.rows[0]) {
      throw new NotFoundException("University not found");
    }

    const duplicate = await this.db.query(
      `SELECT 1 FROM faculties WHERE university_id = $1::uuid AND code = $2 LIMIT 1`,
      [dto.universityId, dto.code.trim().toUpperCase()]
    );
    if (duplicate.rows[0]) {
      throw new ConflictException("Faculty code already exists for this university");
    }

    const facultyId = randomUUID();
    const code = dto.code.trim().toUpperCase();
    const provision = dto.provisionDspace !== false;

    let dspaceCommunityId: string | null = null;
    let dspaceSyncStatus = "pending";

    if (provision) {
      const created = await this.dspaceProvisioner.createFacultyCommunity(dto.name.trim());
      dspaceCommunityId = created.id;
      dspaceSyncStatus = "synced";
    }

    await this.db.query(
      `INSERT INTO faculties (
         id, university_id, code, name, status,
         dspace_community_id, dspace_sync_status, created_by
       ) VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5, $6, $7)`,
      [facultyId, dto.universityId, code, dto.name.trim(), dspaceCommunityId, dspaceSyncStatus, user.sub]
    );

    return this.getFacultyById(facultyId);
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
    return this.getFacultyById(facultyId);
  }

  async provisionFacultyDspace(facultyId: string) {
    const row = await this.getFacultyRow(facultyId);
    const created = await this.dspaceProvisioner.createFacultyCommunity(row.name);
    await this.db.query(
      `UPDATE faculties
       SET dspace_community_id = $1, dspace_sync_status = 'synced', updated_at = NOW()
       WHERE id = $2::uuid`,
      [created.id, facultyId]
    );
    return this.getFacultyById(facultyId);
  }

  async listSemesters(facultyId: string) {
    await this.assertFaculty(facultyId);
    const result = await this.db.query(
      `SELECT s.id,
              s.faculty_id,
              s.code,
              s.name,
              s.status,
              s.collection_name,
              s.dspace_community_id,
              s.dspace_collection_id,
              s.dspace_sync_status,
              s.created_at
       FROM semesters s
       WHERE s.faculty_id = $1::uuid
       ORDER BY s.code DESC`,
      [facultyId]
    );
    return result.rows.map((row) => this.mapSemester(row));
  }

  async createSemester(user: JwtPayload, facultyId: string, dto: CreateSemesterDto) {
    const faculty = await this.getFacultyRow(facultyId);
    if (faculty.status !== "active") {
      throw new BadRequestException("Faculty is inactive");
    }
    let facultyCommunityId = faculty.dspace_community_id as string | null;
    if (!facultyCommunityId) {
      const provisioned = await this.dspaceProvisioner.createFacultyCommunity(faculty.name);
      facultyCommunityId = provisioned.id;
      await this.db.query(
        `UPDATE faculties
         SET dspace_community_id = $1, dspace_sync_status = 'synced', updated_at = NOW()
         WHERE id = $2::uuid`,
        [facultyCommunityId, facultyId]
      );
    }

    const code = dto.code.trim();
    const dup = await this.db.query(
      `SELECT 1 FROM semesters WHERE faculty_id = $1::uuid AND code = $2 LIMIT 1`,
      [facultyId, code]
    );
    if (dup.rows[0]) {
      throw new ConflictException("Semester code already exists for this faculty");
    }

    const collectionName = (dto.collectionName || `Luận văn – ${code}`).trim();
    const structure = await this.dspaceProvisioner.createSemesterStructure(
      facultyCommunityId,
      code,
      dto.name.trim(),
      collectionName
    );

    const semesterId = randomUUID();
    await this.db.query(
      `INSERT INTO semesters (
         id, faculty_id, code, name, status,
         collection_name, dspace_community_id, dspace_collection_id,
         dspace_sync_status, created_by
       ) VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5, $6, $7, 'synced', $8)`,
      [
        semesterId,
        facultyId,
        code,
        dto.name.trim(),
        collectionName,
        structure.communityId,
        structure.collectionId,
        user.sub
      ]
    );
    return this.getSemesterById(semesterId);
  }

  async listSubmissionPeriods(facultyId: string) {
    await this.assertFaculty(facultyId);
    const result = await this.db.query(
      `SELECT sp.id,
              sp.faculty_id,
              sp.semester_id,
              s.code AS semester_code,
              s.name AS semester_name,
              sp.name,
              sp.opens_at,
              sp.closes_at,
              sp.status,
              sp.allow_resubmit,
              sp.created_at,
              sp.updated_at
       FROM submission_periods sp
       JOIN semesters s ON s.id = sp.semester_id
       WHERE sp.faculty_id = $1::uuid
       ORDER BY sp.opens_at DESC`,
      [facultyId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      facultyId: row.faculty_id,
      semesterId: row.semester_id,
      semesterCode: row.semester_code,
      semesterName: row.semester_name,
      name: row.name,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      status: row.status,
      allowResubmit: row.allow_resubmit,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
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

    const periodId = randomUUID();
    await this.db.query(
      `INSERT INTO submission_periods (
         id, faculty_id, semester_id, name, opens_at, closes_at,
         status, allow_resubmit, created_by
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'draft', $7, $8)`,
      [
        periodId,
        facultyId,
        dto.semesterId,
        dto.name.trim(),
        opensAt.toISOString(),
        closesAt.toISOString(),
        dto.allowResubmit !== false,
        user.sub
      ]
    );
    return this.getPeriodById(periodId);
  }

  async openSubmissionPeriod(periodId: string) {
    const period = await this.getPeriodRow(periodId);
    if (period.status === "open") {
      return this.getPeriodById(periodId);
    }
    if (period.status !== "draft" && period.status !== "closed") {
      throw new BadRequestException(`Cannot open period in status ${period.status}`);
    }

    const otherOpen = await this.db.query(
      `SELECT id, name FROM submission_periods
       WHERE faculty_id = $1::uuid AND status = 'open' AND id <> $2::uuid
       LIMIT 1`,
      [period.faculty_id, periodId]
    );
    if (otherOpen.rows[0]) {
      throw new ConflictException(
        `Another period is already open for this faculty: ${otherOpen.rows[0].name}`
      );
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
              f.university_id,
              u.name AS university_name,
              f.code,
              f.name,
              f.status,
              f.dspace_community_id,
              f.dspace_sync_status,
              f.created_at,
              f.updated_at
       FROM faculties f
       JOIN universities u ON u.id = f.university_id
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
              f.university_id,
              u.name AS university_name,
              f.code,
              f.name,
              f.status,
              f.dspace_community_id,
              f.dspace_sync_status,
              f.created_at,
              f.updated_at,
              (SELECT COUNT(*)::int FROM semesters s WHERE s.faculty_id = f.id) AS semester_count,
              (SELECT COUNT(*)::int
               FROM submission_periods sp
               WHERE sp.faculty_id = f.id AND sp.status = 'open') AS open_period_count
       FROM faculties f
       JOIN universities u ON u.id = f.university_id
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
      `SELECT id, faculty_id, code, name, status, collection_name,
              dspace_community_id, dspace_collection_id, dspace_sync_status, created_at
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
      `SELECT id, faculty_id, semester_id, name, opens_at, closes_at, status, allow_resubmit
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
              sp.faculty_id,
              sp.semester_id,
              s.code AS semester_code,
              s.name AS semester_name,
              sp.name,
              sp.opens_at,
              sp.closes_at,
              sp.status,
              sp.allow_resubmit,
              sp.created_at,
              sp.updated_at
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
    return {
      id: row.id,
      facultyId: row.faculty_id,
      semesterId: row.semester_id,
      semesterCode: row.semester_code,
      semesterName: row.semester_name,
      name: row.name,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      status: row.status,
      allowResubmit: row.allow_resubmit,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapFaculty(row: Record<string, unknown>) {
    return {
      id: row.id,
      universityId: row.university_id,
      universityName: row.university_name,
      code: row.code,
      name: row.name,
      status: row.status,
      dspaceCommunityId: row.dspace_community_id,
      dspaceSyncStatus: row.dspace_sync_status,
      semesterCount: row.semester_count ?? 0,
      openPeriodCount: row.open_period_count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapSemester(row: Record<string, unknown>) {
    return {
      id: row.id,
      facultyId: row.faculty_id,
      code: row.code,
      name: row.name,
      status: row.status,
      collectionName: row.collection_name,
      dspaceCommunityId: row.dspace_community_id,
      dspaceCollectionId: row.dspace_collection_id,
      dspaceSyncStatus: row.dspace_sync_status,
      createdAt: row.created_at
    };
  }
}
