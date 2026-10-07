import { Module } from "@nestjs/common";
import { GroupsService } from "./groups.service";
import { WorkflowService } from "./workflow.service";

@Module({
  providers: [WorkflowService, GroupsService],
  exports: [WorkflowService, GroupsService]
})
export class WorkflowModule {}
