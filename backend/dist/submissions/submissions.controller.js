"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const node_fs_1 = require("node:fs");
const path = require("node:path");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const create_submission_dto_1 = require("./dto/create-submission.dto");
const save_draft_dto_1 = require("./dto/save-draft.dto");
const submission_limits_1 = require("./submission-limits");
const submissions_service_1 = require("./submissions.service");
const thesisUploadInterceptor = (0, platform_express_1.FileInterceptor)("thesisFile", {
    storage: (0, multer_1.diskStorage)({
        destination: (_req, _file, cb) => {
            const target = path.join(process.cwd(), "uploads", "incoming");
            (0, node_fs_1.mkdirSync)(target, { recursive: true });
            cb(null, target);
        },
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
    }),
    limits: {
        fileSize: submission_limits_1.THESIS_MAX_FILE_SIZE_BYTES
    }
});
let SubmissionsController = class SubmissionsController {
    constructor(submissionsService) {
        this.submissionsService = submissionsService;
    }
    async create(req, body, thesisFile) {
        if (req.user.sub !== body.studentId) {
            throw new common_1.ForbiddenException("Students can only submit as themselves");
        }
        return this.submissionsService.createSubmission(req.user, body, thesisFile);
    }
    async saveDraft(req, body, thesisFile) {
        if (req.user.sub !== body.studentId) {
            throw new common_1.ForbiddenException("Students can only save drafts for themselves");
        }
        return this.submissionsService.saveDraft(req.user, body, thesisFile);
    }
    async updateDraft(req, submissionId, body, thesisFile) {
        if (req.user.sub !== body.studentId) {
            throw new common_1.ForbiddenException("Students can only update their own drafts");
        }
        return this.submissionsService.updateDraft(req.user, submissionId, body, thesisFile);
    }
    async submit(req, submissionId, body, thesisFile) {
        if (req.user.sub !== body.studentId) {
            throw new common_1.ForbiddenException("Students can only submit their own thesis");
        }
        return this.submissionsService.submitSubmission(req.user, submissionId, body, thesisFile);
    }
    async revertToDraft(req, submissionId) {
        return this.submissionsService.revertSubmissionToDraft(req.user, submissionId);
    }
    async deleteSubmission(req, submissionId) {
        return this.submissionsService.deleteSubmission(req.user, submissionId);
    }
    getAll() {
        return this.submissionsService.getAllSubmissions();
    }
    getByStudent(req, studentId) {
        if (req.user.role === "student" && req.user.sub !== studentId) {
            throw new common_1.ForbiddenException();
        }
        return this.submissionsService.getStudentSubmissions(studentId);
    }
    async downloadFile(req, submissionId, fileId) {
        const { stream, contentType, fileName } = await this.submissionsService.getSubmissionFileStream(req.user, submissionId, fileId);
        const encoded = encodeURIComponent(fileName);
        return new common_1.StreamableFile(stream, {
            type: contentType,
            disposition: `inline; filename*=UTF-8''${encoded}`
        });
    }
};
exports.SubmissionsController = SubmissionsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    (0, common_1.UseInterceptors)(thesisUploadInterceptor),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_submission_dto_1.CreateSubmissionDto, Object]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)("drafts"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    (0, common_1.UseInterceptors)(thesisUploadInterceptor),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, save_draft_dto_1.SaveDraftDto, Object]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "saveDraft", null);
__decorate([
    (0, common_1.Patch)(":submissionId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    (0, common_1.UseInterceptors)(thesisUploadInterceptor),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("submissionId")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, save_draft_dto_1.SaveDraftDto, Object]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "updateDraft", null);
__decorate([
    (0, common_1.Post)(":submissionId/submit"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    (0, common_1.UseInterceptors)(thesisUploadInterceptor),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("submissionId")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, save_draft_dto_1.SaveDraftDto, Object]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)(":submissionId/revert-to-draft"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("submissionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "revertToDraft", null);
__decorate([
    (0, common_1.Delete)(":submissionId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("submissionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "deleteSubmission", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("library_staff", "director"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SubmissionsController.prototype, "getAll", null);
__decorate([
    (0, common_1.Get)("student/:studentId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student", "library_staff", "director"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("studentId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SubmissionsController.prototype, "getByStudent", null);
__decorate([
    (0, common_1.Get)(":submissionId/files/:fileId/download"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student", "reviewer", "library_staff", "director"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("submissionId")),
    __param(2, (0, common_1.Param)("fileId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "downloadFile", null);
exports.SubmissionsController = SubmissionsController = __decorate([
    (0, common_1.Controller)("submissions"),
    __metadata("design:paramtypes", [submissions_service_1.SubmissionsService])
], SubmissionsController);
//# sourceMappingURL=submissions.controller.js.map