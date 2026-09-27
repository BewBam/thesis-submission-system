import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

class FormFieldOptionDto {
  @IsString()
  value!: string;

  @IsString()
  label!: string;
}

export class CreateFormFieldDto {
  @IsString()
  @MinLength(2)
  fieldKey!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsOptional()
  @IsString()
  dspacePath?: string;

  @IsOptional()
  @IsIn(["text", "textarea", "select", "year"])
  inputType?: "text" | "textarea" | "select" | "year";

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldOptionDto)
  options?: FormFieldOptionDto[];

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsIn(["column", "extra"])
  storage?: "column" | "extra";

  @IsOptional()
  @IsString()
  columnName?: string;
}
