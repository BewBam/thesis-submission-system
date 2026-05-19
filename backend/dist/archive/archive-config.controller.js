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
exports.ArchiveConfigController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const archive_config_service_1 = require("./archive-config.service");
const create_faculty_dto_1 = require("./dto/create-faculty.dto");
const create_semester_dto_1 = require("./dto/create-semester.dto");
const create_submission_period_dto_1 = require("./dto/create-submission-period.dto");
const update_faculty_dto_1 = require("./dto/update-faculty.dto");
let ArchiveConfigController = class ArchiveConfigController {
    constructor(archiveConfigService) {
        this.archiveConfigService = archiveConfigService;
    }
    listUniversities() {
        return this.archiveConfigService.listUniversities();
    }
    listFaculties() {
        return this.archiveConfigService.listFaculties();
    }
    createFaculty(req, body) {
        return this.archiveConfigService.createFaculty(req.user, body);
    }
    updateFaculty(facultyId, body) {
        return this.archiveConfigService.updateFaculty(facultyId, body);
    }
    provisionFaculty(facultyId) {
        return this.archiveConfigService.provisionFacultyDspace(facultyId);
    }
    listSemesters(facultyId) {
        return this.archiveConfigService.listSemesters(facultyId);
    }
    createSemester(req, facultyId, body) {
        return this.archiveConfigService.createSemester(req.user, facultyId, body);
    }
    listSubmissionPeriods(facultyId) {
        return this.archiveConfigService.listSubmissionPeriods(facultyId);
    }
    createSubmissionPeriod(req, facultyId, body) {
        return this.archiveConfigService.createSubmissionPeriod(req.user, facultyId, body);
    }
    openPeriod(periodId) {
        return this.archiveConfigService.openSubmissionPeriod(periodId);
    }
    closePeriod(periodId) {
        return this.archiveConfigService.closeSubmissionPeriod(periodId);
    }
};
exports.ArchiveConfigController = ArchiveConfigController;
__decorate([
    (0, common_1.Get)("universities"),
    (0, roles_decorator_1.Roles)("library_staff", "admin", "director"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "listUniversities", null);
__decorate([
    (0, common_1.Get)("faculties"),
    (0, roles_decorator_1.Roles)("library_staff", "admin", "director"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "listFaculties", null);
__decorate([
    (0, common_1.Post)("faculties"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_faculty_dto_1.CreateFacultyDto]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "createFaculty", null);
__decorate([
    (0, common_1.Patch)("faculties/:facultyId"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Param)("facultyId")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_faculty_dto_1.UpdateFacultyDto]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "updateFaculty", null);
__decorate([
    (0, common_1.Post)("faculties/:facultyId/provision-dspace"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Param)("facultyId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "provisionFaculty", null);
__decorate([
    (0, common_1.Get)("faculties/:facultyId/semesters"),
    (0, roles_decorator_1.Roles)("library_staff", "admin", "director"),
    __param(0, (0, common_1.Param)("facultyId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "listSemesters", null);
__decorate([
    (0, common_1.Post)("faculties/:facultyId/semesters"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("facultyId")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_semester_dto_1.CreateSemesterDto]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "createSemester", null);
__decorate([
    (0, common_1.Get)("faculties/:facultyId/submission-periods"),
    (0, roles_decorator_1.Roles)("library_staff", "admin", "director"),
    __param(0, (0, common_1.Param)("facultyId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "listSubmissionPeriods", null);
__decorate([
    (0, common_1.Post)("faculties/:facultyId/submission-periods"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("facultyId")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_submission_period_dto_1.CreateSubmissionPeriodDto]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "createSubmissionPeriod", null);
__decorate([
    (0, common_1.Post)("submission-periods/:periodId/open"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Param)("periodId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "openPeriod", null);
__decorate([
    (0, common_1.Post)("submission-periods/:periodId/close"),
    (0, roles_decorator_1.Roles)("library_staff", "admin"),
    __param(0, (0, common_1.Param)("periodId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArchiveConfigController.prototype, "closePeriod", null);
exports.ArchiveConfigController = ArchiveConfigController = __decorate([
    (0, common_1.Controller)("archive-config"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [archive_config_service_1.ArchiveConfigService])
], ArchiveConfigController);
//# sourceMappingURL=archive-config.controller.js.map