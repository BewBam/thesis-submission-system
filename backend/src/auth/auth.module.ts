import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { GoogleAuthService } from "./google-auth.service";
import { AdminModule } from "../admin/admin.module";
import { UsersModule } from "../users/users.module";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsGuard } from "./permissions.guard";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [
    UsersModule,
    AdminModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "dev-secret-change-me",
      signOptions: { expiresIn: "1h" }
    })
  ],
  providers: [AuthService, GoogleAuthService, JwtStrategy, PermissionsGuard, RolesGuard],
  controllers: [AuthController],
  exports: [JwtModule, PassportModule, PermissionsGuard, RolesGuard, UsersModule]
})
export class AuthModule {}
