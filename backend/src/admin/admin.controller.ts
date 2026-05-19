import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { JwtPayload } from "../auth/jwt.strategy";
import { USER_ROLES } from "../users/user-role";
import { AdminRolesService } from "./admin-roles.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminUsersService } from "./admin-users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly adminRolesService: AdminRolesService,
    private readonly adminSettingsService: AdminSettingsService
  ) {}

  @Get("users")
  listUsers() {
    return this.adminUsersService.listAll();
  }

  @Post("users")
  createUser(@Body() body: CreateUserDto) {
    return this.adminUsersService.create(body);
  }

  @Patch("users/:userId")
  updateUser(@Req() req: { user: JwtPayload }, @Param("userId") userId: string, @Body() body: UpdateUserDto) {
    return this.adminUsersService.update(req.user.sub, userId, body);
  }

  @Get("roles")
  listRoles() {
    return this.adminRolesService.listRolesWithPermissions();
  }

  @Get("roles/meta")
  rolesMeta() {
    return { roles: USER_ROLES };
  }

  @Put("roles/:role")
  updateRolePermissions(@Param("role") role: string, @Body() body: UpdateRolePermissionsDto) {
    return this.adminRolesService.updateRolePermissions(role, body.permissions);
  }

  @Get("settings")
  listSettings() {
    return this.adminSettingsService.list();
  }

  @Patch("settings")
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.adminSettingsService.update(body.settings);
  }
}
