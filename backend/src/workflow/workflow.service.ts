import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createPgPool } from "../users/db-pool";
import { ensurePortalSchema } from "./ensure-schema";

export type WorkflowRole = "reviewer" | "library_staff" | "director";

export type WorkflowStep = {
  id: string;
  sortOrder: number;
  role: WorkflowRole;
  label: string;
};

const ROLES = new Set<WorkflowRole>(["reviewer", "library_staff", "director"]);

@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly db = createPgPool();

  async onModuleInit() {
    await ensurePortalSchema(this.db);
  }

  currentStepSql(role: WorkflowRole) {
    return `EXISTS (
      SELECT 1 FROM submission_steps ss
      WHERE ss.submission_id = s.id
        AND ss.sort_order = s.current_step
        AND ss.role = '${role}'
        AND ss.done = FALSE
    )`;
  }

  async listTemplate(): Promise<WorkflowStep[]> {
    const result = await this.db.query<{ id: string; sort_order: number; role: WorkflowRole; label: string }>(
      `SELECT id, sort_order, role, label FROM workflow_steps ORDER BY sort_order ASC, role ASC, id ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      sortOrder: row.sort_order,
      role: row.role,
      label: row.label
    }));
  }

  async saveTemplate(steps: Array<{ role: string; label?: string; sortOrder: number }>): Promise<WorkflowStep[]> {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException("Workflow must keep at least one step");
    }
    const seen = new Set<string>();
    for (const step of steps) {
      if (!ROLES.has(step.role as WorkflowRole)) {
        throw new BadRequestException("Each step must use reviewer, library_staff, or director");
      }
      if (!Number.isInteger(step.sortOrder) || step.sortOrder < 1) {
        throw new BadRequestException("Order must be a positive whole number");
      }
      const key = `${step.sortOrder}:${step.role}`;
      if (seen.has(key)) {
        throw new BadRequestException("The same role cannot be used twice at the same order");
      }
      seen.add(key);
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM workflow_steps`);
      for (const step of steps) {
        await client.query(
          `INSERT INTO workflow_steps (id, sort_order, role, label) VALUES ($1, $2, $3, $4)`,
          [randomUUID(), step.sortOrder, step.role, (step.label || "").trim()]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.listTemplate();
  }

  async backfillOpenSubmissions() {
    const missing = await this.db.query<{ id: string; status: string }>(
      `SELECT s.id, s.status
       FROM submissions s
       WHERE s.status IN ('reviewing', 'approved')
         AND NOT EXISTS (SELECT 1 FROM submission_steps ss WHERE ss.submission_id = s.id)`
    );
    for (const row of missing.rows) {
      await this.installLegacy(row.id, row.status);
    }
  }

  async snapshot(
    client: PoolClient,
    submissionId: string
  ): Promise<{ status: string; role: WorkflowRole }> {
    const template = await this.listTemplate();
    if (template.length === 0) {
      throw new BadRequestException("Workflow must keep at least one step");
    }
    await client.query(`DELETE FROM submission_steps WHERE submission_id = $1::uuid`, [submissionId]);
    for (const step of template) {
      await client.query(
        `INSERT INTO submission_steps (id, submission_id, sort_order, role, label, done)
         VALUES ($1, $2::uuid, $3, $4, $5, FALSE)`,
        [randomUUID(), submissionId, step.sortOrder, step.role, step.label]
      );
    }
    const orders = [...new Set(template.map((step) => step.sortOrder))].sort((a, b) => a - b);
    const firstOrder = orders[0];
    const firstSteps = template.filter((step) => step.sortOrder === firstOrder);
    const maxOrder = orders[orders.length - 1];
    const onlyFinalDirector =
      firstOrder === maxOrder && firstSteps.length === 1 && firstSteps[0].role === "director";
    const status = onlyFinalDirector ? "approved" : "reviewing";
    await client.query(`UPDATE submissions SET current_step = $1, status = $2 WHERE id = $3::uuid`, [
      firstOrder,
      status,
      submissionId
    ]);
    if (firstSteps.some((step) => step.role === "reviewer")) {
      await this.resetReviewerDecisions(client, submissionId);
      const count = await this.reviewerCount(client, submissionId);
      if (count === 0) {
        const moved = await this.advance(client, submissionId, "reviewer");
        const sibling = firstSteps.find((step) => step.role !== "reviewer");
        return { status: moved.toStatus, role: moved.enteredRole || sibling?.role || "reviewer" };
      }
    }
    const opened = firstSteps.find((step) => step.role === "reviewer") || firstSteps[0];
    return { status, role: opened.role };
  }

  async assertCurrentRole(submissionId: string, role: WorkflowRole) {
    await this.backfillOpenSubmissions();
    const result = await this.db.query<{ role: WorkflowRole; is_last: boolean; status: string }>(
      `SELECT ss.role,
              ss.sort_order = (
                SELECT MAX(sort_order) FROM submission_steps sx WHERE sx.submission_id = s.id
              ) AS is_last,
              s.status
       FROM submissions s
       JOIN submission_steps ss
         ON ss.submission_id = s.id
        AND ss.sort_order = s.current_step
        AND ss.role = $2
        AND ss.done = FALSE
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [submissionId, role]
    );
    const row = result.rows[0];
    if (!row || row.role !== role) {
      throw new BadRequestException("This submission is not waiting for this step");
    }
    return { isLast: Boolean(row.is_last), status: row.status };
  }

  async advance(client: PoolClient, submissionId: string, role: WorkflowRole): Promise<{
    fromStatus: string;
    toStatus: string;
    enteredRole: WorkflowRole | null;
    enteredRoles: WorkflowRole[];
    archived: boolean;
    pendingParallel: boolean;
  }> {
    const current = await client.query<{ status: string; current_step: number }>(
      `SELECT status, current_step FROM submissions WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
      [submissionId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    const marked = await client.query(
      `UPDATE submission_steps
       SET done = TRUE
       WHERE submission_id = $1::uuid
         AND sort_order = $2
         AND role = $3
         AND done = FALSE`,
      [submissionId, row.current_step, role]
    );
    if (!marked.rowCount) {
      throw new BadRequestException("This submission is not waiting for this step");
    }
    return this.proceedIfOrderComplete(client, submissionId, row.status);
  }

  private async proceedIfOrderComplete(
    client: PoolClient,
    submissionId: string,
    fromStatus: string
  ): Promise<{
    fromStatus: string;
    toStatus: string;
    enteredRole: WorkflowRole | null;
    enteredRoles: WorkflowRole[];
    archived: boolean;
    pendingParallel: boolean;
  }> {
    const current = await client.query<{ status: string; current_step: number }>(
      `SELECT status, current_step FROM submissions WHERE id = $1::uuid LIMIT 1`,
      [submissionId]
    );
    const row = current.rows[0];
    if (!row) {
      throw new NotFoundException("Submission not found");
    }
    const steps = await client.query<{ sort_order: number; role: WorkflowRole; done: boolean }>(
      `SELECT sort_order, role, done
       FROM submission_steps
       WHERE submission_id = $1::uuid
       ORDER BY sort_order ASC, role ASC`,
      [submissionId]
    );
    const here = steps.rows.filter((step) => step.sort_order === row.current_step);
    if (here.some((step) => !step.done)) {
      return {
        fromStatus,
        toStatus: row.status,
        enteredRole: null,
        enteredRoles: [],
        archived: false,
        pendingParallel: true
      };
    }
    const nextOrder = steps.rows.find((step) => step.sort_order > row.current_step)?.sort_order;
    if (nextOrder == null) {
      if (here.some((step) => step.role === "director")) {
        await client.query(
          `UPDATE submissions
           SET status = 'archived',
               dspace_publish_status = COALESCE(NULLIF(dspace_publish_status, ''), 'pending')
           WHERE id = $1::uuid`,
          [submissionId]
        );
        return {
          fromStatus,
          toStatus: "archived",
          enteredRole: null,
          enteredRoles: [],
          archived: true,
          pendingParallel: false
        };
      }
      await client.query(`UPDATE submissions SET status = 'approved' WHERE id = $1::uuid`, [submissionId]);
      return {
        fromStatus,
        toStatus: "approved",
        enteredRole: null,
        enteredRoles: [],
        archived: false,
        pendingParallel: false
      };
    }

    const nextSteps = steps.rows.filter((step) => step.sort_order === nextOrder);
    const maxOrder = steps.rows[steps.rows.length - 1]?.sort_order ?? nextOrder;
    const onlyFinalDirector = nextOrder === maxOrder && nextSteps.length === 1 && nextSteps[0].role === "director";
    const toStatus = onlyFinalDirector ? "approved" : "reviewing";
    await client.query(`UPDATE submissions SET current_step = $1, status = $2 WHERE id = $3::uuid`, [
      nextOrder,
      toStatus,
      submissionId
    ]);
    const enteredRoles = nextSteps.map((step) => step.role);
    if (enteredRoles.includes("reviewer")) {
      await this.resetReviewerDecisions(client, submissionId);
      const count = await this.reviewerCount(client, submissionId);
      if (count === 0) {
        await client.query(
          `UPDATE submission_steps
           SET done = TRUE
           WHERE submission_id = $1::uuid AND sort_order = $2 AND role = 'reviewer'`,
          [submissionId, nextOrder]
        );
        return this.proceedIfOrderComplete(client, submissionId, fromStatus);
      }
    }
    return {
      fromStatus,
      toStatus,
      enteredRole: enteredRoles.includes("director")
        ? "director"
        : enteredRoles.includes("library_staff")
          ? "library_staff"
          : enteredRoles[0] || null,
      enteredRoles,
      archived: false,
      pendingParallel: false
    };
  }

  async annotate<T extends { id: string }>(rows: T[]) {
    if (rows.length === 0) {
      return rows;
    }
    const result = await this.db.query<{ id: string; current_step_role: string | null; current_step_is_last: boolean }>(
      `SELECT s.id,
              ss.role AS current_step_role,
              ss.sort_order = mx.max_order AS current_step_is_last
       FROM submissions s
       LEFT JOIN submission_steps ss ON ss.submission_id = s.id AND ss.sort_order = s.current_step
       LEFT JOIN (
         SELECT submission_id, MAX(sort_order) AS max_order
         FROM submission_steps
         GROUP BY submission_id
       ) mx ON mx.submission_id = s.id
       WHERE s.id = ANY($1::uuid[])`,
      [rows.map((row) => row.id)]
    );
    const byId = new Map(result.rows.map((row) => [row.id, row]));
    return rows.map((row) => {
      const step = byId.get(row.id);
      return {
        ...row,
        current_step_role: step?.current_step_role || null,
        current_step_is_last: Boolean(step?.current_step_is_last)
      };
    });
  }

  private async installLegacy(submissionId: string, status: string) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const steps: Array<{ order: number; role: WorkflowRole; label: string }> = [
        { order: 1, role: "reviewer", label: "Review" },
        { order: 2, role: "library_staff", label: "Library" },
        { order: 3, role: "director", label: "Director" }
      ];
      for (const step of steps) {
        await client.query(
          `INSERT INTO submission_steps (id, submission_id, sort_order, role, label)
           VALUES ($1, $2::uuid, $3, $4, $5)`,
          [randomUUID(), submissionId, step.order, step.role, step.label]
        );
      }
      let current = 1;
      if (status === "approved") {
        current = 3;
      } else {
        const ready = await client.query(
          `SELECT 1
           WHERE EXISTS (SELECT 1 FROM reviews r0 WHERE r0.submission_id = $1::uuid)
             AND NOT EXISTS (
               SELECT 1 FROM reviews r1 WHERE r1.submission_id = $1::uuid AND r1.decision = 'pending'
             )
             AND NOT EXISTS (
               SELECT 1 FROM reviews r2 WHERE r2.submission_id = $1::uuid AND r2.decision = 'reject'
             )`,
          [submissionId]
        );
        if (ready.rows[0]) {
          current = 2;
        }
      }
      await client.query(`UPDATE submissions SET current_step = $1 WHERE id = $2::uuid`, [current, submissionId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async resetReviewerDecisions(client: PoolClient, submissionId: string) {
    await client.query(
      `UPDATE reviews
       SET decision = 'pending', comment = NULL, decided_at = NULL
       WHERE submission_id = $1::uuid`,
      [submissionId]
    );
  }

  private async reviewerCount(client: PoolClient, submissionId: string) {
    const result = await client.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM reviews WHERE submission_id = $1::uuid`,
      [submissionId]
    );
    return result.rows[0]?.cnt ?? 0;
  }
}
