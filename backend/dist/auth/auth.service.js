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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const admin_settings_service_1 = require("../admin/admin-settings.service");
const users_service_1 = require("../users/users.service");
let AuthService = class AuthService {
    constructor(usersService, jwtService, adminSettingsService) {
        this.usersService = usersService;
        this.jwtService = jwtService;
        this.adminSettingsService = adminSettingsService;
    }
    async login(payload) {
        const user = await this.usersService.findByUsername(payload.username);
        if (!user || user.password !== payload.password) {
            throw new common_1.UnauthorizedException("Invalid username or password");
        }
        if (user.status === "disabled") {
            throw new common_1.UnauthorizedException("This account has been disabled");
        }
        const maintenanceMode = await this.adminSettingsService.getValue("maintenance_mode");
        if (maintenanceMode === "true" && user.role !== "admin") {
            throw new common_1.UnauthorizedException("System is in maintenance mode. Only administrators can sign in.");
        }
        const accessToken = this.jwtService.sign({
            sub: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role
        });
        return {
            access_token: accessToken,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                role: user.role
            }
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        jwt_1.JwtService,
        admin_settings_service_1.AdminSettingsService])
], AuthService);
//# sourceMappingURL=auth.service.js.map