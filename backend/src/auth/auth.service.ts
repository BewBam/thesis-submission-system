import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AdminSettingsService } from "../admin/admin-settings.service";
import { LoginDto } from "./dto/login.dto";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly adminSettingsService: AdminSettingsService
  ) {}

  async login(payload: LoginDto) {
    const user = await this.usersService.findByUsername(payload.username);
    if (!user || user.password !== payload.password) {
      throw new UnauthorizedException("Invalid username or password");
    }
    if (user.status === "disabled") {
      throw new UnauthorizedException("This account has been disabled");
    }
    const maintenanceMode = await this.adminSettingsService.getValue("maintenance_mode");
    if (maintenanceMode === "true" && user.role !== "admin") {
      throw new UnauthorizedException("System is in maintenance mode. Only administrators can sign in.");
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
}
