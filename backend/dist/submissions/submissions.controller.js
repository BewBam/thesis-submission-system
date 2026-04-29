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
const resubmit_submission_dto_1 = require("./dto/resubmit-submission.dto");
const submissions_service_1 = require("./submissions.service");
let SubmissionsController = class SubmissionsController {
    constructor(submissionsService) {
        this.submissionsService = submissionsService;
    }
    async create(req, body, files) {
        const thesisFile = files?.thesisFile?.[0];
        const attachments = (files?.attachments || []);
        if (req.user.sub !== body.studentId) {
            throw new common_1.ForbiddenException("Students can only submit as themselves");
        }
        return this.submissionsService.createSubmission(req.user, body, thesisFile, attachments);
    }
    async resubmit(req, submissionId, body, files) {
        const thesisFile = files?.thesisFile?.[0];
        const attachments = (files?.attachments || []);
        return this.submissionsService.resubmitSubmission(req.user, submissionId, body, thesisFile, attachments);
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
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: "thesisFile", maxCount: 1 },
        { name: "attachments", maxCount: 10 }
    ], {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                const target = path.join(process.cwd(), "uploads", "incoming");
                (0, node_fs_1.mkdirSync)(target, { recursive: true });
                cb(null, target);
            },
            filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
        }),
        limits: {
            fileSize: 20 * 1024 * 1024
        }
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_submission_dto_1.CreateSubmissionDto, Object]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(":submissionId/resubmit"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: "thesisFile", maxCount: 1 },
        { name: "attachments", maxCount: 10 }
    ], {
        storage: (0, multer_1.diskStorage)({
            destination: (_req, _file, cb) => {
                const target = path.join(process.cwd(), "uploads", "incoming");
                (0, node_fs_1.mkdirSync)(target, { recursive: true });
                cb(null, target);
            },
            filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
        }),
        limits: {
            fileSize: 20 * 1024 * 1024
        }
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("submissionId")),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, resubmit_submission_dto_1.ResubmitSubmissionDto, Object]),
    __metadata("design:returntype", Promise)
], SubmissionsController.prototype, "resubmit", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SubmissionsController.prototype, "getAll", null);
__decorate([
    (0, common_1.Get)("student/:studentId"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student", "admin"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("studentId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SubmissionsController.prototype, "getByStudent", null);
__decorate([
    (0, common_1.Get)(":submissionId/files/:fileId/download"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student", "reviewer", "admin"),
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