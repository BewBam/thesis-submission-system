import { Transform } from "class-transformer";
import { IsObject, IsOptional, IsString } from "class-validator";

export class ThesisMetadataFieldsDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  titleVi?: string;

  @IsOptional()
  @IsString()
  titleEn?: string;

  /** @deprecated use titleEn */
  @IsOptional()
  @IsString()
  title?: string;

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

  /** Dynamic / custom form field values (JSON object or JSON string for multipart). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") {
      return undefined;
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    return {};
  })
  @IsObject()
  metadata?: Record<string, string>;
}
