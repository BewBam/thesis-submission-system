import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { GroupsService } from "../workflow/groups.service";
import { USER_ROLES, isUserRole } from "./user-role";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("submit_thesis", "configure_system")
  async listByRole(@Query("role") role: string, @Query("forStudent") forStudent?: string) {
    if (!role || !isUserRole(role)) {
      throw new BadRequestException(`Query role must be one of: ${USER_ROLES.join(", ")}`);
    }
    const users = await this.usersService.listByRole(role);
    if (role === "reviewer" && forStudent?.trim()) {
      return this.groupsService.filterReviewers(users, forStudent.trim());
    }
    return users;
  }
}
