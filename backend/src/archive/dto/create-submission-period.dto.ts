import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateSubmissionPeriodDto {
  @IsUUID()
  semesterId!: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsISO8601()
  opensAt!: string;

  @IsISO8601()
  closesAt!: string;

  @IsOptional()
  @IsBoolean()
  allowResubmit?: boolean;
}
