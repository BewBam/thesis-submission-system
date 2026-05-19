import { IsOptional, IsString } from "class-validator";

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
}
