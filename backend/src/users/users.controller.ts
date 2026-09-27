import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { USER_ROLES, isUserRole } from "./user-role";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("submit_thesis", "configure_system")
  async listByRole(@Query("role") role: string) {
    if (!role || !isUserRole(role)) {
      throw new BadRequestException(`Query role must be one of: ${USER_ROLES.join(", ")}`);
    }
    return this.usersService.listByRole(role);
  }
}
