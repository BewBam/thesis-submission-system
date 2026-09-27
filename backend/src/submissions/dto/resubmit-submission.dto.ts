import { IsOptional, IsString } from "class-validator";

export class ResubmitSubmissionDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  abstract?: string;
}
