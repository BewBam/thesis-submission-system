import { Transform } from "class-transformer";
import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ThesisMetadataFieldsDto } from "./thesis-metadata-fields.dto";

function parseAuthorIds(value: unknown): string[] {
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
    } catch (_error) {
      // fall through to comma-separated
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseReviewerIds(value: unknown): string[] {
  return parseAuthorIds(value);
}

export class CreateSubmissionDto extends ThesisMetadataFieldsDto {
  @IsOptional()
  @IsString()
  titleVi?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  @IsOptional()
  @Transform(({ value }) => parseAuthorIds(value))
  @IsArray()
  @IsString({ each: true })
  authorIds?: string[];

  @IsOptional()
  @Transform(({ value }) => parseReviewerIds(value))
  @IsArray()
  @IsString({ each: true })
  reviewerIds?: string[];

  @IsOptional()
  @IsString()
  thesisAdvisors?: string;

  @IsOptional()
  @IsString()
  major?: string;

  @IsOptional()
  @IsString()
  thesisYear?: string;

  @IsOptional()
  @IsString()
  abstract?: string;

  @IsOptional()
  @IsString()
  dateIssued?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsOptional()
  @IsString()
  submissionPeriodId?: string;
}
