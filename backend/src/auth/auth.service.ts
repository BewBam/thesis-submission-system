import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { LoginDto } from "./dto/login.dto";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) {}

  async login(payload: LoginDto) {
    const user = await this.usersService.findByUsername(payload.username);
    if (!user || user.password !== payload.password) {
      throw new UnauthorizedException("Invalid username or password");
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
