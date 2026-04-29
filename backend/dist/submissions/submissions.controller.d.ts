import { StreamableFile } from "@nestjs/common";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { ResubmitSubmissionDto } from "./dto/resubmit-submission.dto";
import { SubmissionsService } from "./submissions.service";
export declare class SubmissionsController {
    private readonly submissionsService;
    constructor(submissionsService: SubmissionsService);
    create(req: {
        user: JwtPayload;
    }, body: CreateSubmissionDto, files: {
        thesisFile?: Array<{
            [key: string]: unknown;
        }>;
        attachments?: Array<{
            [key: string]: unknown;
        }>;
    }): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
    }>;
    resubmit(req: {
        user: JwtPayload;
    }, submissionId: string, body: ResubmitSubmissionDto, files: {
        thesisFile?: Array<{
            [key: string]: unknown;
        }>;
        attachments?: Array<{
            [key: string]: unknown;
        }>;
    }): Promise<{
        id: string;
        status: string;
    }>;
    getAll(): Promise<any[]>;
    getByStudent(req: {
        user: JwtPayload;
    }, studentId: string): Promise<any[]>;
    downloadFile(req: {
        user: JwtPayload;
    }, submissionId: string, fileId: string): Promise<StreamableFile>;
}
