import { IsBoolean, IsISO8601, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateSubmissionPeriodDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsISO8601()
  opensAt?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;

  @IsOptional()
  @IsBoolean()
  allowResubmit?: boolean;
}
