import { Module } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { ArchiveConfigController } from "./archive-config.controller";
import { ArchiveConfigService } from "./archive-config.service";
import { ArchiveController } from "./archive.controller";
import { DspaceProvisionerService } from "./dspace-provisioner.service";
import { DspacePublishService } from "./dspace-publish.service";
import { SubmissionPeriodsService } from "./submission-periods.service";

@Module({
  controllers: [ArchiveController, ArchiveConfigController],
  providers: [
    SubmissionPeriodsService,
    ArchiveConfigService,
    DspaceProvisionerService,
    DspacePublishService,
    RolesGuard
  ],
  exports: [SubmissionPeriodsService, DspacePublishService]
})
export class ArchiveModule {}
