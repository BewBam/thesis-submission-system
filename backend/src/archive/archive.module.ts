import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { SubmissionFormModule } from "../submissions/submission-form.module";
import { UsersModule } from "../users/users.module";
import { ArchiveConfigController } from "./archive-config.controller";
import { ArchiveConfigService } from "./archive-config.service";
import { ArchiveController } from "./archive.controller";
import { DspaceProvisionerService } from "./dspace-provisioner.service";
import { DspacePublishService } from "./dspace-publish.service";
import { DspaceSyncService } from "./dspace-sync.service";
import { SubmissionPeriodsService } from "./submission-periods.service";

@Module({
  imports: [UsersModule, PassportModule.register({ defaultStrategy: "jwt" }), SubmissionFormModule],
  controllers: [ArchiveController, ArchiveConfigController],
  providers: [
    SubmissionPeriodsService,
    ArchiveConfigService,
    DspaceProvisionerService,
    DspacePublishService,
    DspaceSyncService,
    JwtAuthGuard,
    PermissionsGuard
  ],
  exports: [SubmissionPeriodsService, DspacePublishService, DspaceProvisionerService]
})
export class ArchiveModule {}
