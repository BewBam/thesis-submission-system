import type { JwtPayload } from "../auth/jwt.strategy";
import { UsersService } from "../users/users.service";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { ResubmitSubmissionDto } from "./dto/resubmit-submission.dto";
type UploadedFile = {
    originalname: string;
    mimetype: string;
    path: string;
    filename: string;
};
export declare class SubmissionsService {
    private readonly usersService;
    private readonly db;
    constructor(usersService: UsersService);
    createSubmission(actor: JwtPayload, dto: CreateSubmissionDto, thesisFile: UploadedFile | undefined, attachments: UploadedFile[]): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        status: string;
    }>;
    getStudentSubmissions(studentId: string): Promise<any[]>;
    getAllSubmissions(): Promise<any[]>;
    resubmitSubmission(actor: JwtPayload, submissionId: string, dto: ResubmitSubmissionDto, thesisFile: UploadedFile | undefined, attachments: UploadedFile[]): Promise<{
        id: string;
        status: string;
    }>;
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
