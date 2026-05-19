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
exports.ArchiveController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const submission_periods_service_1 = require("./submission-periods.service");
let ArchiveController = class ArchiveController {
    constructor(submissionPeriodsService) {
        this.submissionPeriodsService = submissionPeriodsService;
    }
    listFaculties() {
        return this.submissionPeriodsService.listFacultiesWithOpenPeriods();
    }
    listSemesters(facultyId) {
        return this.submissionPeriodsService.listSemestersWithOpenPeriods(facultyId);
    }
    listOpenPeriods(facultyId, semesterId) {
        if (!facultyId || !semesterId) {
            return [];
        }
        return this.submissionPeriodsService.listOpenPeriods(facultyId, semesterId);
    }
};
exports.ArchiveController = ArchiveController;
__decorate([
    (0, common_1.Get)("faculties"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ArchiveController.prototype, "listFaculties", null);
__decorate([
    (0, common_1.Get)("faculties/:facultyId/semesters"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    __param(0, (0, common_1.Param)("facultyId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ArchiveController.prototype, "listSemesters", null);
__decorate([
    (0, common_1.Get)("submission-periods"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("student"),
    __param(0, (0, common_1.Query)("facultyId")),
    __param(1, (0, common_1.Query)("semesterId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ArchiveController.prototype, "listOpenPeriods", null);
exports.ArchiveController = ArchiveController = __decorate([
    (0, common_1.Controller)("archive"),
    __metadata("design:paramtypes", [submission_periods_service_1.SubmissionPeriodsService])
], ArchiveController);
//# sourceMappingURL=archive.controller.js.map