import {
  BadRequestException,
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
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateSubmissionDto } from "./dto/create-submission.dto";
import { SaveDraftDto } from "./dto/save-draft.dto";
import { THESIS_MAX_FILE_SIZE_BYTES, isThesisPdfUpload } from "./submission-limits";
import { SubmissionFormFieldsService } from "./submission-form-fields.service";
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
  },
  fileFilter: (_req, file, cb) => {
    if (!isThesisPdfUpload(file)) {
      cb(new BadRequestException("Thesis file must be a PDF") as unknown as Error, false);
      return;
    }
    cb(null, true);
  }
});

type UploadedThesisFile = { originalname: string; mimetype: string; path: string; filename: string };

@Controller("submissions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubmissionsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly formFieldsService: SubmissionFormFieldsService
  ) {}

  private assertActorMayUseStudentId(actor: JwtPayload, studentId: string) {
    if (actor.role === "admin") {
      return;
    }
    if (actor.sub !== studentId) {
      throw new ForbiddenException("Students can only submit as themselves");
    }
  }

  @Get("form-fields")
  @RequirePermissions("submit_thesis", "library_intake", "director_approval", "view_all_submissions", "configure_system")
  listFormFields() {
    return this.formFieldsService.listEnabled();
  }

  @Post()
  @RequirePermissions("submit_thesis", "configure_system")
  @UseInterceptors(thesisUploadInterceptor)
  async create(
    @Req() req: { user: JwtPayload },
    @Body() body: CreateSubmissionDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    this.assertActorMayUseStudentId(req.user, body.studentId);
    return this.submissionsService.createSubmission(req.user, body, thesisFile);
  }

  @Post("drafts")
  @RequirePermissions("submit_thesis", "configure_system")
  @UseInterceptors(thesisUploadInterceptor)
  async saveDraft(
    @Req() req: { user: JwtPayload },
    @Body() body: SaveDraftDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    this.assertActorMayUseStudentId(req.user, body.studentId);
    return this.submissionsService.saveDraft(req.user, body, thesisFile);
  }

  @Patch(":submissionId")
  @RequirePermissions("submit_thesis", "configure_system")
  @UseInterceptors(thesisUploadInterceptor)
  async updateDraft(
    @Req() req: { user: JwtPayload },
    @Param("submissionId") submissionId: string,
    @Body() body: SaveDraftDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    this.assertActorMayUseStudentId(req.user, body.studentId);
    return this.submissionsService.updateDraft(req.user, submissionId, body, thesisFile);
  }

  @Post(":submissionId/submit")
  @RequirePermissions("submit_thesis", "configure_system")
  @UseInterceptors(thesisUploadInterceptor)
  async submit(
    @Req() req: { user: JwtPayload },
    @Param("submissionId") submissionId: string,
    @Body() body: SaveDraftDto,
    @UploadedFile() thesisFile?: UploadedThesisFile
  ) {
    this.assertActorMayUseStudentId(req.user, body.studentId);
    return this.submissionsService.submitSubmission(req.user, submissionId, body, thesisFile);
  }

  @Post(":submissionId/revert-to-draft")
  @RequirePermissions("submit_thesis", "configure_system")
  async revertToDraft(@Req() req: { user: JwtPayload }, @Param("submissionId") submissionId: string) {
    return this.submissionsService.revertSubmissionToDraft(req.user, submissionId);
  }

  @Delete(":submissionId")
  @RequirePermissions("submit_thesis", "library_intake", "director_approval", "configure_system")
  async deleteSubmission(@Req() req: { user: JwtPayload }, @Param("submissionId") submissionId: string) {
    return this.submissionsService.deleteSubmission(req.user, submissionId);
  }

  @Get()
  @RequirePermissions("view_all_submissions", "configure_system")
  getAll() {
    return this.submissionsService.getAllSubmissions();
  }

  @Get("student/:studentId")
  @RequirePermissions("submit_thesis", "view_all_submissions", "configure_system")
  getByStudent(@Req() req: { user: JwtPayload }, @Param("studentId") studentId: string) {
    if (req.user.role === "student" && req.user.sub !== studentId) {
      throw new ForbiddenException();
    }
    return this.submissionsService.getStudentSubmissions(studentId);
  }

  @Get(":submissionId/files/:fileId/download")
  @RequirePermissions(
    "submit_thesis",
    "review_academic",
    "library_intake",
    "director_approval",
    "view_all_submissions",
    "configure_system"
  )
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
