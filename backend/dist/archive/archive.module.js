"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArchiveModule = void 0;
const common_1 = require("@nestjs/common");
const roles_guard_1 = require("../auth/roles.guard");
const archive_config_controller_1 = require("./archive-config.controller");
const archive_config_service_1 = require("./archive-config.service");
const archive_controller_1 = require("./archive.controller");
const dspace_provisioner_service_1 = require("./dspace-provisioner.service");
const dspace_publish_service_1 = require("./dspace-publish.service");
const submission_periods_service_1 = require("./submission-periods.service");
let ArchiveModule = class ArchiveModule {
};
exports.ArchiveModule = ArchiveModule;
exports.ArchiveModule = ArchiveModule = __decorate([
    (0, common_1.Module)({
        controllers: [archive_controller_1.ArchiveController, archive_config_controller_1.ArchiveConfigController],
        providers: [
            submission_periods_service_1.SubmissionPeriodsService,
            archive_config_service_1.ArchiveConfigService,
            dspace_provisioner_service_1.DspaceProvisionerService,
            dspace_publish_service_1.DspacePublishService,
            roles_guard_1.RolesGuard
        ],
        exports: [submission_periods_service_1.SubmissionPeriodsService, dspace_publish_service_1.DspacePublishService]
    })
], ArchiveModule);
//# sourceMappingURL=archive.module.js.map