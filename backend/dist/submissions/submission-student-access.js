"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSubmissionStatus = normalizeSubmissionStatus;
exports.getStudentSubmissionCapabilities = getStudentSubmissionCapabilities;
exports.assertStudentSubmissionCapability = assertStudentSubmissionCapability;
exports.assertSubmissionOwnership = assertSubmissionOwnership;
const common_1 = require("@nestjs/common");
function normalizeSubmissionStatus(status) {
    return status === "reject" ? "rejected" : status;
}
function getStudentSubmissionCapabilities(status, reviewDecisions) {
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
function assertStudentSubmissionCapability(capabilities, action) {
    const allowed = action === "edit"
        ? capabilities.canEdit
        : action === "delete"
            ? capabilities.canDelete
            : action === "revert_draft"
                ? capabilities.canRevertToDraft
                : capabilities.canSubmit;
    if (allowed) {
        return;
    }
    const message = action === "edit"
        ? "This thesis cannot be edited in its current state"
        : action === "delete"
            ? "This thesis cannot be deleted after a reviewer or staff member has acted on it"
            : action === "revert_draft"
                ? "This thesis can only be reverted to draft while all reviewers are still pending"
                : "This thesis cannot be submitted in its current state";
    throw new common_1.BadRequestException(message);
}
function assertSubmissionOwnership(studentId, ownerId) {
    if (studentId !== ownerId) {
        throw new common_1.ForbiddenException("Students can only manage their own submissions");
    }
}
//# sourceMappingURL=submission-student-access.js.map