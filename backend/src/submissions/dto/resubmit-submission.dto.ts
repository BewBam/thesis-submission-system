import { Transform } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

function normalizeKeywords(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

export class ResubmitSubmissionDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  abstract?: string;

  @Transform(({ value }) => normalizeKeywords(value))
  @IsString()
  @IsOptional()
  keywords?: string;
}
