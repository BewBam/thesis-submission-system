import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createPgPool } from "../users/db-pool";

export type GroupKind = "student" | "reviewer";

@Injectable()
export class GroupsService {
  private readonly db = createPgPool();

  reviewerCanSeeStudentSql(reviewerParam: string) {
    return `(
      NOT EXISTS (SELECT 1 FROM reviewer_group_grants)
      OR EXISTS (
        SELECT 1
        FROM user_group_members student_member
        JOIN reviewer_group_grants grant_row ON grant_row.student_group_id = student_member.group_id
        JOIN user_group_members reviewer_member ON reviewer_member.group_id = grant_row.reviewer_group_id
        WHERE student_member.user_id = s.student_id
          AND reviewer_member.user_id = ${reviewerParam}
      )
    )`;
  }

  async list() {
    const groups = await this.db.query<{ id: string; name: string; kind: GroupKind }>(
      `SELECT id, name, kind FROM user_groups ORDER BY kind ASC, name ASC`
    );
    const members = await this.db.query<{ group_id: string; user_id: string }>(
      `SELECT group_id, user_id FROM user_group_members ORDER BY user_id ASC`
    );
    const grants = await this.db.query<{ reviewer_group_id: string; student_group_id: string }>(
      `SELECT reviewer_group_id, student_group_id FROM reviewer_group_grants`
    );
    return groups.rows.map((group) => ({
      id: group.id,
      name: group.name,
      kind: group.kind,
      members: members.rows.filter((row) => row.group_id === group.id).map((row) => row.user_id),
      grants: grants.rows
        .filter((row) => row.reviewer_group_id === group.id)
        .map((row) => row.student_group_id)
    }));
  }

  async create(name: string, kind: GroupKind) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException("Group name is required");
    }
    if (kind !== "student" && kind !== "reviewer") {
      throw new BadRequestException("Group kind must be student or reviewer");
    }
    const id = randomUUID();
    await this.db.query(`INSERT INTO user_groups (id, name, kind) VALUES ($1, $2, $3)`, [id, trimmed, kind]);
    return { id, name: trimmed, kind, members: [], grants: [] };
  }

  async remove(groupId: string) {
    const result = await this.db.query(`DELETE FROM user_groups WHERE id = $1::uuid`, [groupId]);
    if (result.rowCount === 0) {
      throw new NotFoundException("Group not found");
    }
    return { deleted: true, id: groupId };
  }

  async setMembers(groupId: string, userIds: string[]) {
    const group = await this.requireGroup(groupId);
    const unique = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
    if (unique.length > 0) {
      const users = await this.db.query<{ username: string; role: string }>(
        `SELECT username, role FROM users WHERE username = ANY($1::text[])`,
        [unique]
      );
      if (users.rows.length !== unique.length) {
        throw new BadRequestException("One or more users were not found");
      }
      const expected = group.kind === "student" ? "student" : "reviewer";
      if (users.rows.some((user) => user.role !== expected)) {
        throw new BadRequestException(`Members of a ${group.kind} group must have the ${expected} role`);
      }
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM user_group_members WHERE group_id = $1::uuid`, [groupId]);
      for (const userId of unique) {
        await client.query(`INSERT INTO user_group_members (group_id, user_id) VALUES ($1::uuid, $2)`, [
          groupId,
          userId
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { id: groupId, members: unique };
  }

  async setGrants(groupId: string, studentGroupIds: string[]) {
    const group = await this.requireGroup(groupId);
    if (group.kind !== "reviewer") {
      throw new BadRequestException("Only reviewer groups can be granted student groups");
    }
    const unique = Array.from(new Set(studentGroupIds));
    if (unique.length > 0) {
      const found = await this.db.query<{ id: string; kind: GroupKind }>(
        `SELECT id, kind FROM user_groups WHERE id = ANY($1::uuid[])`,
        [unique]
      );
      if (found.rows.length !== unique.length || found.rows.some((row) => row.kind !== "student")) {
        throw new BadRequestException("Grants must reference student groups");
      }
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM reviewer_group_grants WHERE reviewer_group_id = $1::uuid`, [groupId]);
      for (const studentGroupId of unique) {
        await client.query(
          `INSERT INTO reviewer_group_grants (reviewer_group_id, student_group_id) VALUES ($1::uuid, $2::uuid)`,
          [groupId, studentGroupId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { id: groupId, grants: unique };
  }

  async filterReviewers<T extends { id: string }>(users: T[], studentId: string) {
    const allowed = await this.allowedReviewerIds(studentId);
    if (allowed === null) {
      return users;
    }
    const allowedSet = new Set(allowed);
    return users.filter((user) => allowedSet.has(user.id));
  }

  async assertReviewersAllowed(studentId: string, reviewerIds: string[]) {
    if (reviewerIds.length === 0) {
      return;
    }
    const allowed = await this.allowedReviewerIds(studentId);
    if (allowed === null) {
      return;
    }
    const allowedSet = new Set(allowed);
    if (reviewerIds.some((id) => !allowedSet.has(id))) {
      throw new BadRequestException("A selected reviewer is not allowed to review this student");
    }
  }

  async assertReviewerMayAct(reviewerId: string, studentId: string) {
    const exists = await this.db.query(`SELECT 1 FROM reviewer_group_grants LIMIT 1`);
    if (!exists.rows[0]) {
      return;
    }
    const result = await this.db.query(
      `SELECT 1
       FROM user_group_members student_member
       JOIN reviewer_group_grants grant_row ON grant_row.student_group_id = student_member.group_id
       JOIN user_group_members reviewer_member ON reviewer_member.group_id = grant_row.reviewer_group_id
       WHERE student_member.user_id = $1
         AND reviewer_member.user_id = $2
       LIMIT 1`,
      [studentId, reviewerId]
    );
    if (!result.rows[0]) {
      throw new ForbiddenException("You are not allowed to review this student");
    }
  }

  private async allowedReviewerIds(studentId: string): Promise<string[] | null> {
    const exists = await this.db.query(`SELECT 1 FROM reviewer_group_grants LIMIT 1`);
    if (!exists.rows[0]) {
      return null;
    }
    const result = await this.db.query<{ user_id: string }>(
      `SELECT DISTINCT reviewer_member.user_id
       FROM user_group_members student_member
       JOIN reviewer_group_grants grant_row ON grant_row.student_group_id = student_member.group_id
       JOIN user_group_members reviewer_member ON reviewer_member.group_id = grant_row.reviewer_group_id
       WHERE student_member.user_id = $1`,
      [studentId]
    );
    return result.rows.map((row) => row.user_id);
  }

  private async requireGroup(groupId: string) {
    const result = await this.db.query<{ id: string; name: string; kind: GroupKind }>(
      `SELECT id, name, kind FROM user_groups WHERE id = $1::uuid LIMIT 1`,
      [groupId]
    );
    const group = result.rows[0];
    if (!group) {
      throw new NotFoundException("Group not found");
    }
    return group;
  }
}
