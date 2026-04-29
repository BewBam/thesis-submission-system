import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { UserRole, UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listByRole(@Query("role") role: string) {
    const allowed: UserRole[] = ["student", "reviewer", "admin"];
    if (!role || !allowed.includes(role as UserRole)) {
      throw new BadRequestException("Query role must be one of: student, reviewer, admin");
    }
    return this.usersService.listByRole(role as UserRole);
  }
}
