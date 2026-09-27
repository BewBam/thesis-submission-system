import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AdminSettingsService } from "../admin/admin-settings.service";
import { LoginDto } from "./dto/login.dto";
import { GoogleAuthService } from "./google-auth.service";
import { UsersService, type UserRecord } from "../users/users.service";

export type LoginMethod = "username" | "google";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly googleAuthService: GoogleAuthService
  ) {}

  async getLoginOptions() {
    const googleConfigured = this.googleAuthService.isConfigured();
    const setting = (await this.adminSettingsService.getValue("login_method"))?.trim();
    const method: LoginMethod = setting === "google" && googleConfigured ? "google" : "username";
    return { method, googleConfigured };
  }

  async login(payload: LoginDto) {
    const { method } = await this.getLoginOptions();
    const user = await this.usersService.findByUsername(payload.username);
    if (method === "google" && user?.role !== "admin") {
      throw new ForbiddenException("Password login is disabled. Use Google sign-in.");
    }
    if (!user || !user.password || user.password !== payload.password) {
      throw new UnauthorizedException("Invalid username or password");
    }
    await this.assertUserMaySignIn(user);
    return this.sessionResponse(user);
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (user.status === "disabled") {
      throw new UnauthorizedException("This account has been disabled");
    }
    return this.publicUser(user);
  }

  getGoogleAuthorizeRedirect(): string {
    if (!this.googleAuthService.isConfigured()) {
      throw new ServiceUnavailableException("Google sign-in is not configured");
    }
    return this.googleAuthService.buildAuthorizeUrl();
  }

  async assertGoogleLoginEnabled() {
    const { method, googleConfigured } = await this.getLoginOptions();
    if (!googleConfigured) {
      throw new ServiceUnavailableException("Google sign-in is not configured");
    }
    if (method !== "google") {
      throw new ForbiddenException("Google sign-in is disabled. Use username and password.");
    }
  }

  async handleGoogleCallback(query: { code?: string; state?: string; error?: string }): Promise<string> {
    const frontend = this.googleAuthService.frontendUrl();
    const fail = (error: string) => `${frontend}/?error=${encodeURIComponent(error)}`;

    if (query.error) {
      return fail(query.error === "access_denied" ? "cancelled" : "oauth");
    }
    if (!this.googleAuthService.verifyState(query.state) || !query.code) {
      return fail("oauth");
    }

    try {
      const profile = await this.googleAuthService.exchangeCode(query.code);
      if (!profile.emailVerified || !this.googleAuthService.isAllowedEmail(profile.email)) {
        return fail("domain");
      }
      const username = this.googleAuthService.usernameFromEmail(profile.email);
      if (!username) {
        return fail("domain");
      }

      const existing = await this.usersService.findByUsername(username);
      if (!existing) {
        return fail("not_registered");
      }
      const user =
        (await this.usersService.updateProfileFromGoogle(existing.username, {
          displayName: profile.name || ""
        })) || existing;

      await this.assertUserMaySignIn(user);
      const { access_token } = this.sessionResponse(user);
      return `${frontend}/?access_token=${encodeURIComponent(access_token)}`;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        const message = error.message || "unauthorized";
        if (message.toLowerCase().includes("disabled")) {
          return fail("disabled");
        }
        if (message.toLowerCase().includes("maintenance")) {
          return fail("maintenance");
        }
        return fail("oauth");
      }
      return fail("oauth");
    }
  }

  private async assertUserMaySignIn(user: UserRecord) {
    if (user.status === "disabled") {
      throw new UnauthorizedException("This account has been disabled");
    }
    const maintenanceMode = await this.adminSettingsService.getValue("maintenance_mode");
    if (maintenanceMode === "true" && user.role !== "admin") {
      throw new UnauthorizedException("System is in maintenance mode. Only administrators can sign in.");
    }
  }

  private sessionResponse(user: UserRecord) {
    const publicUser = this.publicUser(user);
    const accessToken = this.jwtService.sign({
      sub: user.username,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      email: user.email
    });
    return {
      access_token: accessToken,
      user: publicUser
    };
  }

  private publicUser(user: UserRecord) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      email: user.email,
      facultyId: user.facultyId,
      facultyName: user.facultyName
    };
  }
}
