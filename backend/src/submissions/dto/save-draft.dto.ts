import { Transform } from "class-transformer";
import { IsArray, IsOptional, IsString } from "class-validator";
import { ThesisMetadataFieldsDto } from "./thesis-metadata-fields.dto";

function parseIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // comma-separated fallback
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export class SaveDraftDto extends ThesisMetadataFieldsDto {
  @IsOptional()
  @Transform(({ value }) => parseIds(value))
  @IsArray()
  @IsString({ each: true })
  authorIds?: string[];

  @IsOptional()
  @Transform(({ value }) => parseIds(value))
  @IsArray()
  @IsString({ each: true })
  reviewerIds?: string[];

  @IsOptional()
  @IsString()
  abstract?: string;

  @IsString()
  studentId!: string;

  @IsOptional()
  @IsString()
  submissionPeriodId?: string;
}
