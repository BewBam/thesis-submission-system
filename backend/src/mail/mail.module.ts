import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { MailService } from "./mail.service";
import { WorkflowMailService } from "./workflow-mail.service";

@Module({
  imports: [AdminModule],
  providers: [MailService, WorkflowMailService],
  exports: [MailService, WorkflowMailService]
})
export class MailModule {}
