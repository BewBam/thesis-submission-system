import { Module } from "@nestjs/common";
import { ArchiveModule } from "../archive/archive.module";
import { AuthModule } from "../auth/auth.module";
import { PermissionsGuard } from "../auth/permissions.guard";
import { MailModule } from "../mail/mail.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [AuthModule, ArchiveModule, MailModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, PermissionsGuard]
})
export class ReviewsModule {}
