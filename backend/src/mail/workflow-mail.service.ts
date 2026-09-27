import { Injectable, Logger } from "@nestjs/common";
import { createPgPool } from "../users/db-pool";
import { buildStudentEmail } from "../submissions/submission-metadata";
import { AdminSettingsService } from "../admin/admin-settings.service";
import { MailService, type EmailTemplateVars } from "./mail.service";

type SubmissionMailRow = {
  id: string;
  title: string;
  author: string;
  reviewer: string;
  student_email: string | null;
  student_username: string | null;
  student_display_name: string | null;
  faculty_name: string | null;
  semester_name: string | null;
  title_vi: string | null;
  title_en: string | null;
};

@Injectable()
export class WorkflowMailService {
  private readonly db = createPgPool();
  private readonly logger = new Logger(WorkflowMailService.name);

  constructor(
    private readonly mail: MailService,
    private readonly settings: AdminSettingsService
  ) {}

  private userEmail(username: string): string {
    return buildStudentEmail(username);
  }

  private async loadSubmission(submissionId: string): Promise<SubmissionMailRow | null> {
    const result = await this.db.query<SubmissionMailRow>(
      `SELECT s.id,
              s.title,
              s.author,
              s.reviewer,
              s.student_email,
              s.faculty_name,
              s.semester_name,
              s.title_vi,
              s.title_en,
              u.username AS student_username,
              u.display_name AS student_display_name
       FROM submissions s
       LEFT JOIN users u ON u.username = s.student_id
       WHERE s.id = $1::uuid
       LIMIT 1`,
      [submissionId]
    );
    return result.rows[0] ?? null;
  }

  private async buildVars(row: SubmissionMailRow, extra: EmailTemplateVars = {}): Promise<EmailTemplateVars> {
    const portalUrl =
      (await this.settings.getValue("email_portal_url"))?.trim() || "http://localhost:5173";
    const studentName =
      row.student_display_name?.trim() ||
      row.student_username?.trim() ||
      row.author?.split(";")[0]?.trim() ||
      "Student";
    const studentEmail =
      row.student_email?.trim() ||
      (row.student_username ? this.userEmail(row.student_username) : "");

    return {
      title: row.title || "",
      titleVi: row.title_vi || row.title || "",
      titleEn: row.title_en || row.title || "",
      studentName,
      studentEmail,
      author: row.author || "",
      advisor: row.reviewer || "",
      facultyName: row.faculty_name || "",
      semesterName: row.semester_name || "",
      submissionId: row.id,
      portalUrl,
      reason: "",
      ...extra
    };
  }

  private async emailsByRole(role: "library_staff" | "director"): Promise<string[]> {
    const result = await this.db.query<{ username: string }>(
      `SELECT username FROM users WHERE role = $1 AND status = 'active'`,
      [role]
    );
    return result.rows.map((row) => this.userEmail(row.username)).filter(Boolean);
  }

  private async assignedReviewerEmails(submissionId: string): Promise<string[]> {
    const result = await this.db.query<{ username: string }>(
      `SELECT u.username
       FROM reviews r
       JOIN users u ON u.username = r.reviewer_id
       WHERE r.submission_id = $1::uuid AND u.status = 'active'`,
      [submissionId]
    );
    return result.rows.map((row) => this.userEmail(row.username)).filter(Boolean);
  }

  /** Fire-and-forget wrapper so workflow APIs never fail on mail errors. */
  notifySafely(label: string, task: () => Promise<void>): void {
    void task().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const secret = process.env.SMTP_PASSWORD;
      const safe =
        secret && secret.length > 0 ? message.split(secret).join("***") : message;
      this.logger.error(`Workflow email "${label}" failed: ${safe}`);
    });
  }

  private reasonBlock(reason?: string): string {
    const text = reason?.trim();
    return text ? `Lý do / Reason: ${text}\n` : "";
  }

  private actionLabels(resubmit: boolean): { action: string; actionVi: string; actionEn: string } {
    if (resubmit) {
      return { action: "resubmitted", actionVi: "nộp lại", actionEn: "resubmitted" };
    }
    return { action: "submitted", actionVi: "nộp", actionEn: "submitted" };
  }

  private decisionLabels(decision: "approved" | "rejected" | "archived"): {
    decision: string;
    decisionVi: string;
    decisionEn: string;
  } {
    if (decision === "approved") {
      return { decision: "approved", decisionVi: "đã duyệt", decisionEn: "approved" };
    }
    if (decision === "archived") {
      return {
        decision: "approved and archived",
        decisionVi: "đã duyệt và lưu trữ",
        decisionEn: "approved and archived"
      };
    }
    return { decision: "rejected", decisionVi: "đã từ chối", decisionEn: "rejected" };
  }

  private async notifyStudent(
    submissionId: string,
    options: {
      subjectKey: string;
      bodyKey: string;
      defaultSubject: string;
      defaultBody: string;
      extra?: EmailTemplateVars;
    }
  ): Promise<void> {
    const row = await this.loadSubmission(submissionId);
    if (!row) {
      return;
    }
    const vars = await this.buildVars(row, options.extra);
    const to = vars.studentEmail;
    if (!to) {
      this.logger.warn(`No student email for submission ${submissionId}`);
      return;
    }
    await this.mail.sendTemplated({
      to,
      subjectKey: options.subjectKey,
      bodyKey: options.bodyKey,
      vars,
      defaultSubject: options.defaultSubject,
      defaultBody: options.defaultBody
    });
  }

  async notifyStudentOnSubmitted(submissionId: string, resubmit = false): Promise<void> {
    const labels = this.actionLabels(resubmit);
    await this.notifyStudent(submissionId, {
      subjectKey: "email_subject_student_submitted",
      bodyKey: "email_body_student_submitted",
      extra: labels,
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Luận văn của bạn đã được {{actionVi}} | Your thesis was {{actionEn}}",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào {{studentName}},\n\nLuận văn của bạn đã được {{actionVi}} và đang chờ phản biện.\n\nTên đề tài: {{title}}\n\nTheo dõi trên cổng:\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nYour thesis has been {{actionEn}} and is now with the assigned reviewers.\n\nTitle: {{title}}\n\nTrack progress in the portal:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyStudentOnReviewerDecision(
    submissionId: string,
    decision: "approved" | "rejected",
    actorName: string,
    reason?: string
  ): Promise<void> {
    const labels = this.decisionLabels(decision);
    await this.notifyStudent(submissionId, {
      subjectKey: "email_subject_student_reviewer_decision",
      bodyKey: "email_body_student_reviewer_decision",
      extra: {
        ...labels,
        actorName: actorName.trim() || "a reviewer / một phản biện",
        reason: reason?.trim() || "",
        reasonBlock: this.reasonBlock(reason)
      },
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Phản biện {{decisionVi}} luận văn | A reviewer {{decisionEn}} your thesis",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào {{studentName}},\n\nPhản biện {{actorName}} {{decisionVi}} luận văn của bạn.\n\nTên đề tài: {{title}}\n{{reasonBlock}}\nĐăng nhập:\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nReviewer {{actorName}} has {{decisionEn}} your thesis.\n\nTitle: {{title}}\n{{reasonBlock}}\nSign in:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyStudentOnAllReviewersApproved(submissionId: string): Promise<void> {
    await this.notifyStudent(submissionId, {
      subjectKey: "email_subject_student_all_reviewers_approved",
      bodyKey: "email_body_student_all_reviewers_approved",
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Tất cả phản biện đã duyệt | All reviewers approved your thesis",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào {{studentName}},\n\nTất cả phản biện học thuật đã duyệt luận văn. Hồ sơ đang chuyển tới cán bộ thư viện.\n\nTên đề tài: {{title}}\n\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nAll academic reviewers have approved your thesis. It is now with library staff.\n\nTitle: {{title}}\n\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyStudentOnLibraryDecision(
    submissionId: string,
    decision: "approved" | "rejected",
    actorName: string,
    reason?: string
  ): Promise<void> {
    const labels = this.decisionLabels(decision);
    await this.notifyStudent(submissionId, {
      subjectKey: "email_subject_student_library_decision",
      bodyKey: "email_body_student_library_decision",
      extra: {
        ...labels,
        actorName: actorName.trim() || "cán bộ thư viện / library staff",
        reason: reason?.trim() || "",
        reasonBlock: this.reasonBlock(reason)
      },
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Thư viện {{decisionVi}} luận văn | Library staff {{decisionEn}} your thesis",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào {{studentName}},\n\nCán bộ thư viện ({{actorName}}) {{decisionVi}} luận văn của bạn.\n\nTên đề tài: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nLibrary staff ({{actorName}}) has {{decisionEn}} your thesis.\n\nTitle: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyStudentOnDirectorDecision(
    submissionId: string,
    decision: "approved" | "rejected",
    actorName: string,
    reason?: string
  ): Promise<void> {
    const labels = this.decisionLabels(decision === "approved" ? "archived" : "rejected");
    await this.notifyStudent(submissionId, {
      subjectKey: "email_subject_student_director_decision",
      bodyKey: "email_body_student_director_decision",
      extra: {
        ...labels,
        actorName: actorName.trim() || "giám đốc thư viện / the library director",
        reason: reason?.trim() || "",
        reasonBlock: this.reasonBlock(reason)
      },
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Giám đốc thư viện {{decisionVi}} luận văn | The library director {{decisionEn}} your thesis",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào {{studentName}},\n\nGiám đốc thư viện ({{actorName}}) {{decisionVi}} luận văn của bạn.\n\nTên đề tài: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nThe library director ({{actorName}}) has {{decisionEn}} your thesis.\n\nTitle: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyReviewersOnSubmit(submissionId: string): Promise<void> {
    const row = await this.loadSubmission(submissionId);
    if (!row) {
      return;
    }
    const to = await this.assignedReviewerEmails(submissionId);
    if (to.length === 0) {
      this.logger.warn(`No reviewer emails for submission ${submissionId}`);
      return;
    }
    const vars = await this.buildVars(row);
    await this.mail.sendTemplated({
      to,
      subjectKey: "email_subject_reviewer_assigned",
      bodyKey: "email_body_reviewer_assigned",
      vars,
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Có luận văn mới cần phản biện | New thesis awaiting your review",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào,\n\nMột luận văn đã được nộp và phân công cho bạn phản biện.\n\nTên đề tài: {{title}}\nSinh viên: {{studentName}}\nTác giả: {{author}}\nGVHD: {{advisor}}\nKhoa: {{facultyName}}\nHọc kỳ: {{semesterName}}\n\nĐăng nhập để phản biện:\n{{portalUrl}}\n\n--- English ---\nHello,\n\nA thesis has been submitted and assigned to you for review.\n\nTitle: {{title}}\nStudent: {{studentName}}\nAuthors: {{author}}\nAdvisors: {{advisor}}\nFaculty: {{facultyName}}\nSemester: {{semesterName}}\n\nPlease sign in to review:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyLibraryOnAllReviewersApproved(submissionId: string): Promise<void> {
    const row = await this.loadSubmission(submissionId);
    if (!row) {
      return;
    }
    const to = await this.emailsByRole("library_staff");
    if (to.length === 0) {
      this.logger.warn(`No library_staff emails for submission ${submissionId}`);
      return;
    }
    const vars = await this.buildVars(row);
    await this.mail.sendTemplated({
      to,
      subjectKey: "email_subject_library_review",
      bodyKey: "email_body_library_review",
      vars,
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Luận văn sẵn sàng tiếp nhận thư viện | Thesis ready for library intake",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào,\n\nTất cả phản biện học thuật đã duyệt luận văn. Hồ sơ sẵn sàng để thư viện tiếp nhận.\n\nTên đề tài: {{title}}\nSinh viên: {{studentName}}\nTác giả: {{author}}\nKhoa: {{facultyName}}\nHọc kỳ: {{semesterName}}\n\nĐăng nhập để xử lý:\n{{portalUrl}}\n\n--- English ---\nHello,\n\nAll academic reviewers have approved this thesis. It is ready for library intake.\n\nTitle: {{title}}\nStudent: {{studentName}}\nAuthors: {{author}}\nFaculty: {{facultyName}}\nSemester: {{semesterName}}\n\nPlease sign in to process intake:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyDirectorsOnLibraryApproved(submissionId: string): Promise<void> {
    const row = await this.loadSubmission(submissionId);
    if (!row) {
      return;
    }
    const to = await this.emailsByRole("director");
    if (to.length === 0) {
      this.logger.warn(`No director emails for submission ${submissionId}`);
      return;
    }
    const vars = await this.buildVars(row);
    await this.mail.sendTemplated({
      to,
      subjectKey: "email_subject_director_review",
      bodyKey: "email_body_director_review",
      vars,
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Luận văn đã duyệt — sẵn sàng lưu trữ | Thesis approved — ready to archive",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào,\n\nCán bộ thư viện đã duyệt luận văn. Hồ sơ sẵn sàng để giám đốc lưu trữ.\n\nTên đề tài: {{title}}\nSinh viên: {{studentName}}\nTác giả: {{author}}\nKhoa: {{facultyName}}\nHọc kỳ: {{semesterName}}\n\nĐăng nhập để lưu trữ:\n{{portalUrl}}\n\n--- English ---\nHello,\n\nLibrary staff have approved this thesis. It is ready for director archive.\n\nTitle: {{title}}\nStudent: {{studentName}}\nAuthors: {{author}}\nFaculty: {{facultyName}}\nSemester: {{semesterName}}\n\nPlease sign in to archive:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }

  async notifyStudentOnRejected(submissionId: string, reason: string): Promise<void> {
    const row = await this.loadSubmission(submissionId);
    if (!row) {
      return;
    }
    const vars = await this.buildVars(row, { reason: reason?.trim() || "(no reason provided)" });
    const to = vars.studentEmail;
    if (!to) {
      this.logger.warn(`No student email for rejected submission ${submissionId}`);
      return;
    }
    await this.mail.sendTemplated({
      to,
      subjectKey: "email_subject_student_rejected",
      bodyKey: "email_body_student_rejected",
      vars,
      defaultSubject:
        "[Cổng luận văn / Thesis Portal] Luận văn của bạn bị từ chối | Your thesis submission was rejected",
      defaultBody:
        "--- Tiếng Việt ---\nXin chào {{studentName}},\n\nLuận văn của bạn đã bị từ chối.\n\nTên đề tài: {{title}}\nLý do: {{reason}}\n\nBạn có thể chỉnh sửa và nộp lại trên cổng:\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nYour thesis submission was rejected.\n\nTitle: {{title}}\nReason: {{reason}}\n\nYou may revise and resubmit in the portal:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal"
    });
  }
}
