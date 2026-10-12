import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class WorkflowStepInputDto {
  @IsIn(["reviewer", "library_staff", "director"])
  role!: "reviewer" | "library_staff" | "director";

  @IsOptional()
  @IsString()
  label?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder!: number;
}

export class SaveWorkflowDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepInputDto)
  steps!: WorkflowStepInputDto[];
}
