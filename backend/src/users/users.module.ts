import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { PermissionsService } from "./permissions.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" })],
  controllers: [UsersController],
  providers: [UsersService, PermissionsService, JwtAuthGuard, PermissionsGuard],
  exports: [UsersService, PermissionsService]
})
export class UsersModule {}
