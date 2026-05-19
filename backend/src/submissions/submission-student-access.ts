import { BadRequestException, ForbiddenException } from "@nestjs/common";

export type StudentSubmissionAction = "edit" | "delete" | "revert_draft" | "submit";

export type StudentSubmissionCapabilities = {
  canEdit: boolean;
  canDelete: boolean;
  canRevertToDraft: boolean;
  canSubmit: boolean;
};

export function normalizeSubmissionStatus(status: string): string {
  return status === "reject" ? "rejected" : status;
}

export function getStudentSubmissionCapabilities(
  status: string,
  reviewDecisions: string[]
): StudentSubmissionCapabilities {
  const normalizedStatus = normalizeSubmissionStatus(status);
  const hasReviewerDecision = reviewDecisions.some((decision) => decision && decision !== "pending");

  if (normalizedStatus === "draft") {
    return {
      canEdit: true,
      canDelete: true,
      canRevertToDraft: false,
      canSubmit: true
    };
  }

  if (normalizedStatus === "archived") {
    return {
      canEdit: false,
      canDelete: false,
      canRevertToDraft: false,
      canSubmit: false
    };
  }

  if (normalizedStatus === "rejected" || normalizedStatus === "approved") {
    return {
      canEdit: true,
      canDelete: false,
      canRevertToDraft: false,
      canSubmit: true
    };
  }

  if (normalizedStatus === "reviewing") {
    if (hasReviewerDecision) {
      return {
        canEdit: false,
        canDelete: false,
        canRevertToDraft: false,
        canSubmit: false
      };
    }
    return {
      canEdit: true,
      canDelete: true,
      canRevertToDraft: true,
      canSubmit: false
    };
  }

  return {
    canEdit: false,
    canDelete: false,
    canRevertToDraft: false,
    canSubmit: false
  };
}

export function assertStudentSubmissionCapability(
  capabilities: StudentSubmissionCapabilities,
  action: StudentSubmissionAction
): void {
  const allowed =
    action === "edit"
      ? capabilities.canEdit
      : action === "delete"
        ? capabilities.canDelete
        : action === "revert_draft"
          ? capabilities.canRevertToDraft
          : capabilities.canSubmit;

  if (allowed) {
    return;
  }

  const message =
    action === "edit"
      ? "This thesis cannot be edited in its current state"
      : action === "delete"
        ? "This thesis cannot be deleted after a reviewer or staff member has acted on it"
        : action === "revert_draft"
          ? "This thesis can only be reverted to draft while all reviewers are still pending"
          : "This thesis cannot be submitted in its current state";

  throw new BadRequestException(message);
}

export function assertSubmissionOwnership(studentId: string, ownerId: string): void {
  if (studentId !== ownerId) {
    throw new ForbiddenException("Students can only manage their own submissions");
  }
}
