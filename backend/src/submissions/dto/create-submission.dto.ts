import { Transform } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from "class-validator";
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
  @IsString()
  @IsNotEmpty()
  titleVi!: string;

  @IsString()
  @IsNotEmpty()
  titleEn!: string;

  @Transform(({ value }) => parseAuthorIds(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  authorIds!: string[];

  @Transform(({ value }) => parseReviewerIds(value))
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  reviewerIds!: string[];

  @IsString()
  @IsNotEmpty()
  thesisAdvisors!: string;

  @IsString()
  @IsNotEmpty()
  major!: string;

  @IsString()
  @IsNotEmpty()
  thesisYear!: string;

  @IsString()
  @IsNotEmpty()
  abstract!: string;

  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  submissionPeriodId!: string;
}
