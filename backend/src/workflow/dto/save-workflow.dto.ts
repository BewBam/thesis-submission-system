import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

class WorkflowStepInputDto {
  @IsIn(["reviewer", "library_staff", "director"])
  role!: "reviewer" | "library_staff" | "director";

  @IsOptional()
  @IsString()
  label?: string;
}

export class SaveWorkflowDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepInputDto)
  steps!: WorkflowStepInputDto[];
}
