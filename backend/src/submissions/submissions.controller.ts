import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Post,
  Req,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { ResubmitSubmissionDto } from "./dto/resubmit-submission.dto";
import { SubmissionsService } from "./submissions.service";

@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "thesisFile", maxCount: 1 },
        { name: "attachments", maxCount: 10 }
      ],
      {
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const target = path.join(process.cwd(), "uploads", "incoming");
            mkdirSync(target, { recursive: true });
            cb(null, target);
          },
          filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
        }),
        limits: {
          fileSize: 20 * 1024 * 1024
        }
      }
    )
  )
  async create(
    @Req() req: { user: JwtPayload },
    @Body() body: CreateSubmissionDto,
    @UploadedFiles()
    files: { thesisFile?: Array<{ [key: string]: unknown }>; attachments?: Array<{ [key: string]: unknown }> }
  ) {
    const thesisFile = files?.thesisFile?.[0] as
      | { originalname: string; mimetype: string; path: string; filename: string }
      | undefined;
    const attachments = (files?.attachments || []) as Array<{
      originalname: string;
      mimetype: string;
      path: string;
      filename: string;
    }>;
    if (req.user.sub !== body.studentId) {
      throw new ForbiddenException("Students can only submit as themselves");
    }
    return this.submissionsService.createSubmission(req.user, body, thesisFile, attachments);
  }

  @Put(":submissionId/resubmit")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "thesisFile", maxCount: 1 },
        { name: "attachments", maxCount: 10 }
      ],
      {
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const target = path.join(process.cwd(), "uploads", "incoming");
            mkdirSync(target, { recursive: true });
            cb(null, target);
          },
          filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
        }),
        limits: {
          fileSize: 20 * 1024 * 1024
        }
      }
    )
  )
  async resubmit(
    @Req() req: { user: JwtPayload },
    @Param("submissionId") submissionId: string,
    @Body() body: ResubmitSubmissionDto,
    @UploadedFiles()
    files: { thesisFile?: Array<{ [key: string]: unknown }>; attachments?: Array<{ [key: string]: unknown }> }
  ) {
    const thesisFile = files?.thesisFile?.[0] as
      | { originalname: string; mimetype: string; path: string; filename: string }
      | undefined;
    const attachments = (files?.attachments || []) as Array<{
      originalname: string;
      mimetype: string;
      path: string;
      filename: string;
    }>;
    return this.submissionsService.resubmitSubmission(req.user, submissionId, body, thesisFile, attachments);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  getAll() {
    return this.submissionsService.getAllSubmissions();
  }

  @Get("student/:studentId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student", "admin")
  getByStudent(@Req() req: { user: JwtPayload }, @Param("studentId") studentId: string) {
    if (req.user.role === "student" && req.user.sub !== studentId) {
      throw new ForbiddenException();
    }
    return this.submissionsService.getStudentSubmissions(studentId);
  }

  @Get(":submissionId/files/:fileId/download")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student", "reviewer", "admin")
  async downloadFile(
    @Req() req: { user: JwtPayload },
    @Param("submissionId") submissionId: string,
    @Param("fileId") fileId: string
  ) {
    const { stream, contentType, fileName } = await this.submissionsService.getSubmissionFileStream(
      req.user,
      submissionId,
      fileId
    );
    const encoded = encodeURIComponent(fileName);
    return new StreamableFile(stream, {
      type: contentType,
      disposition: `inline; filename*=UTF-8''${encoded}`
    });
  }
}
