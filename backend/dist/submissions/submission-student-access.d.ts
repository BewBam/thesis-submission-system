export type StudentSubmissionAction = "edit" | "delete" | "revert_draft" | "submit";
export type StudentSubmissionCapabilities = {
    canEdit: boolean;
    canDelete: boolean;
    canRevertToDraft: boolean;
    canSubmit: boolean;
};
export declare function normalizeSubmissionStatus(status: string): string;
export declare function getStudentSubmissionCapabilities(status: string, reviewDecisions: string[]): StudentSubmissionCapabilities;
export declare function assertStudentSubmissionCapability(capabilities: StudentSubmissionCapabilities, action: StudentSubmissionAction): void;
export declare function assertSubmissionOwnership(studentId: string, ownerId: string): void;
