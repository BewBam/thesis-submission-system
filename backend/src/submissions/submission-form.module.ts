import { Module } from "@nestjs/common";
import { SubmissionFormFieldsService } from "./submission-form-fields.service";

@Module({
  providers: [SubmissionFormFieldsService],
  exports: [SubmissionFormFieldsService]
})
export class SubmissionFormModule {}
