import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { SubmissionFormModule } from "../submissions/submission-form.module";
import { UsersModule } from "../users/users.module";
import { WorkflowModule } from "../workflow/workflow.module";
import { AdminController } from "./admin.controller";
import { AdminRolesService } from "./admin-roles.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminUsersService } from "./admin-users.service";

@Module({
  imports: [UsersModule, PassportModule.register({ defaultStrategy: "jwt" }), SubmissionFormModule, WorkflowModule],
  controllers: [AdminController],
  providers: [
    AdminUsersService,
    AdminRolesService,
    AdminSettingsService,
    JwtAuthGuard,
    PermissionsGuard
  ],
  exports: [AdminSettingsService]
})
export class AdminModule {}
