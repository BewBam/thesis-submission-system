import { Module } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { AdminController } from "./admin.controller";
import { AdminRolesService } from "./admin-roles.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminUsersService } from "./admin-users.service";

@Module({
  controllers: [AdminController],
  providers: [AdminUsersService, AdminRolesService, AdminSettingsService, RolesGuard],
  exports: [AdminSettingsService]
})
export class AdminModule {}
