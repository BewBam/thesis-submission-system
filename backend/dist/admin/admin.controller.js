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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const roles_guard_1 = require("../auth/roles.guard");
const user_role_1 = require("../users/user-role");
const admin_roles_service_1 = require("./admin-roles.service");
const admin_settings_service_1 = require("./admin-settings.service");
const admin_users_service_1 = require("./admin-users.service");
const create_user_dto_1 = require("./dto/create-user.dto");
const update_role_permissions_dto_1 = require("./dto/update-role-permissions.dto");
const update_settings_dto_1 = require("./dto/update-settings.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
let AdminController = class AdminController {
    constructor(adminUsersService, adminRolesService, adminSettingsService) {
        this.adminUsersService = adminUsersService;
        this.adminRolesService = adminRolesService;
        this.adminSettingsService = adminSettingsService;
    }
    listUsers() {
        return this.adminUsersService.listAll();
    }
    createUser(body) {
        return this.adminUsersService.create(body);
    }
    updateUser(req, userId, body) {
        return this.adminUsersService.update(req.user.sub, userId, body);
    }
    listRoles() {
        return this.adminRolesService.listRolesWithPermissions();
    }
    rolesMeta() {
        return { roles: user_role_1.USER_ROLES };
    }
    updateRolePermissions(role, body) {
        return this.adminRolesService.updateRolePermissions(role, body.permissions);
    }
    listSettings() {
        return this.adminSettingsService.list();
    }
    updateSettings(body) {
        return this.adminSettingsService.update(body.settings);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)("users"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Post)("users"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, common_1.Patch)("users/:userId"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)("userId")),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Get)("roles"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listRoles", null);
__decorate([
    (0, common_1.Get)("roles/meta"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "rolesMeta", null);
__decorate([
    (0, common_1.Put)("roles/:role"),
    __param(0, (0, common_1.Param)("role")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_role_permissions_dto_1.UpdateRolePermissionsDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateRolePermissions", null);
__decorate([
    (0, common_1.Get)("settings"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listSettings", null);
__decorate([
    (0, common_1.Patch)("settings"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_settings_dto_1.UpdateSettingsDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateSettings", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)("admin"),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)("admin"),
    __metadata("design:paramtypes", [admin_users_service_1.AdminUsersService,
        admin_roles_service_1.AdminRolesService,
        admin_settings_service_1.AdminSettingsService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map