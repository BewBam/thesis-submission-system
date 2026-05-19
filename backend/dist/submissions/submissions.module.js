"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionsModule = void 0;
const common_1 = require("@nestjs/common");
const archive_module_1 = require("../archive/archive.module");
const auth_module_1 = require("../auth/auth.module");
const roles_guard_1 = require("../auth/roles.guard");
const users_module_1 = require("../users/users.module");
const submissions_controller_1 = require("./submissions.controller");
const submissions_service_1 = require("./submissions.service");
let SubmissionsModule = class SubmissionsModule {
};
exports.SubmissionsModule = SubmissionsModule;
exports.SubmissionsModule = SubmissionsModule = __decorate([
    (0, common_1.Module)({
        imports: [users_module_1.UsersModule, auth_module_1.AuthModule, archive_module_1.ArchiveModule],
        controllers: [submissions_controller_1.SubmissionsController],
        providers: [submissions_service_1.SubmissionsService, roles_guard_1.RolesGuard]
    })
], SubmissionsModule);
//# sourceMappingURL=submissions.module.js.map