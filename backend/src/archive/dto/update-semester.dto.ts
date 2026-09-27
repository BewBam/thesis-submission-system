import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateSemesterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
