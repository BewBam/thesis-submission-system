import type { JwtPayload } from "../auth/jwt.strategy";
import { SubmissionPeriodsService } from "../archive/submission-periods.service";
import { UsersService } from "../users/users.service";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { SaveDraftDto } from "./dto/save-draft.dto";
type UploadedFile = {
    originalname: string;
    mimetype: string;
    path: string;
    filename: string;
};
export declare class SubmissionsService {
    private readonly usersService;
    private readonly submissionPeriodsService;
    private readonly db;
    constructor(usersService: UsersService, submissionPeriodsService: SubmissionPeriodsService);
    private assertThesisFileValid;
    private assertStudentMaySubmit;
    private loadReviewDecisions;
    private assertStudentSubmissionAction;
    private rethrowSubmissionLimitError;
    createSubmission(actor: JwtPayload, dto: CreateSubmissionDto, thesisFile: UploadedFile | undefined): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
    }>;
    saveDraft(actor: JwtPayload, dto: SaveDraftDto, thesisFile?: UploadedFile): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
    }>;
    updateDraft(actor: JwtPayload, submissionId: string, dto: SaveDraftDto, thesisFile?: UploadedFile): Promise<{
        id: string;
        status: string;
    }>;
    submitSubmission(actor: JwtPayload, submissionId: string, dto: SaveDraftDto, thesisFile?: UploadedFile): Promise<{
        id: string;
        status: string;
    }>;
    deleteSubmission(actor: JwtPayload, submissionId: string): Promise<{
        ok: boolean;
    }>;
    revertSubmissionToDraft(actor: JwtPayload, submissionId: string): Promise<{
        id: string;
        status: string;
    }>;
    private resolveAuthorsAndReviewers;
    private replaceAuthors;
    private replaceReviewers;
    private replaceThesisFile;
    getStudentSubmissions(studentId: string): Promise<any[]>;
    getAllSubmissions(): Promise<any[]>;
    getSubmissionFileStream(user: JwtPayload, submissionId: string, fileId: string): Promise<{
        stream: import("fs").ReadStream;
        contentType: string;
        fileName: string;
    }>;
    private contentTypeForFileName;
    private assertResolvedFilePathUnderSubmission;
    private moveUploadedFile;
    private deleteFileSilently;
}
export {};
