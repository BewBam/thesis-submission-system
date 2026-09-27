import { Module } from "@nestjs/common";
import { ArchiveModule } from "../archive/archive.module";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "../auth/permissions.guard";
import { MailModule } from "../mail/mail.module";
import { UsersModule } from "../users/users.module";
import { SubmissionFormModule } from "./submission-form.module";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

@Module({
  imports: [UsersModule, AuthModule, ArchiveModule, SubmissionFormModule, MailModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, PermissionsGuard],
  exports: [SubmissionFormModule]
})
export class SubmissionsModule {}
