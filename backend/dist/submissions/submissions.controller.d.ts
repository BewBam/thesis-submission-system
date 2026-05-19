import { StreamableFile } from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { SaveDraftDto } from "./dto/save-draft.dto";
import { SubmissionsService } from "./submissions.service";
type UploadedThesisFile = {
    originalname: string;
    mimetype: string;
    path: string;
    filename: string;
};
export declare class SubmissionsController {
    private readonly submissionsService;
    constructor(submissionsService: SubmissionsService);
    create(req: {
        user: JwtPayload;
    }, body: CreateSubmissionDto, thesisFile?: UploadedThesisFile): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
    }>;
    saveDraft(req: {
        user: JwtPayload;
    }, body: SaveDraftDto, thesisFile?: UploadedThesisFile): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
    }>;
    updateDraft(req: {
        user: JwtPayload;
    }, submissionId: string, body: SaveDraftDto, thesisFile?: UploadedThesisFile): Promise<{
        id: string;
        status: string;
    }>;
    submit(req: {
        user: JwtPayload;
    }, submissionId: string, body: SaveDraftDto, thesisFile?: UploadedThesisFile): Promise<{
        id: string;
        status: string;
    }>;
    revertToDraft(req: {
        user: JwtPayload;
    }, submissionId: string): Promise<{
        id: string;
        status: string;
    }>;
    deleteSubmission(req: {
        user: JwtPayload;
    }, submissionId: string): Promise<{
        ok: boolean;
    }>;
    getAll(): Promise<any[]>;
    getByStudent(req: {
        user: JwtPayload;
    }, studentId: string): Promise<any[]>;
    downloadFile(req: {
        user: JwtPayload;
    }, submissionId: string, fileId: string): Promise<StreamableFile>;
}
export {};
