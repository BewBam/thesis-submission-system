import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { mkdirSync } from "node:fs";
import * as path from "node:path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { SaveDraftDto } from "./dto/save-draft.dto";
import { THESIS_MAX_FILE_SIZE_BYTES } from "./submission-limits";
import { SubmissionsService } from "./submissions.service";

const thesisUploadInterceptor = FileInterceptor("thesisFile", {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      const target = path.join(process.cwd(), "uploads", "incoming");
      mkdirSync(target, { recursive: true });
      cb(null, target);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
  }),
  limits: {
    fileSize: THESIS_MAX_FILE_SIZE_BYTES
  }
});

type UploadedThesisFile = { originalname: string; mimetype: string; path: string; filename: string };

@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  @UseInterceptors(thesisUploadInterceptor)
  async create(
    @Req() req: { user: JwtPayload },
    @Body() body: CreateSubmissionDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    if (req.user.sub !== body.studentId) {
      throw new ForbiddenException("Students can only submit as themselves");
    }
    return this.submissionsService.createSubmission(req.user, body, thesisFile);
  }

  @Post("drafts")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  @UseInterceptors(thesisUploadInterceptor)
  async saveDraft(
    @Req() req: { user: JwtPayload },
    @Body() body: SaveDraftDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    if (req.user.sub !== body.studentId) {
      throw new ForbiddenException("Students can only save drafts for themselves");
    }
    return this.submissionsService.saveDraft(req.user, body, thesisFile);
  }

  @Patch(":submissionId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  @UseInterceptors(thesisUploadInterceptor)
  async updateDraft(
    @Req() req: { user: JwtPayload },
    @Param("submissionId") submissionId: string,
    @Body() body: SaveDraftDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    if (req.user.sub !== body.studentId) {
      throw new ForbiddenException("Students can only update their own drafts");
    }
    return this.submissionsService.updateDraft(req.user, submissionId, body, thesisFile);
  }

  @Post(":submissionId/submit")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  @UseInterceptors(thesisUploadInterceptor)
  async submit(
    @Req() req: { user: JwtPayload },
    @Param("submissionId") submissionId: string,
    @Body() body: SaveDraftDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    if (req.user.sub !== body.studentId) {
      throw new ForbiddenException("Students can only submit their own thesis");
    }
    return this.submissionsService.submitSubmission(req.user, submissionId, body, thesisFile);
  }

  @Post(":submissionId/revert-to-draft")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  async revertToDraft(@Req() req: { user: JwtPayload }, @Param("submissionId") submissionId: string) {
    return this.submissionsService.revertSubmissionToDraft(req.user, submissionId);
  }

  @Delete(":submissionId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  async deleteSubmission(@Req() req: { user: JwtPayload }, @Param("submissionId") submissionId: string) {
    return this.submissionsService.deleteSubmission(req.user, submissionId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("library_staff", "director")
  getAll() {
    return this.submissionsService.getAllSubmissions();
  }

  @Get("student/:studentId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student", "library_staff", "director")
  getByStudent(@Req() req: { user: JwtPayload }, @Param("studentId") studentId: string) {
    if (req.user.role === "student" && req.user.sub !== studentId) {
      throw new ForbiddenException();
    }
    return this.submissionsService.getStudentSubmissions(studentId);
  }

  @Get(":submissionId/files/:fileId/download")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student", "reviewer", "library_staff", "director")
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
