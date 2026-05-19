import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { USER_ROLES, isUserRole } from "./user-role";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listByRole(@Query("role") role: string) {
    if (!role || !isUserRole(role)) {
      throw new BadRequestException(`Query role must be one of: ${USER_ROLES.join(", ")}`);
    }
    return this.usersService.listByRole(role);
  }
}
