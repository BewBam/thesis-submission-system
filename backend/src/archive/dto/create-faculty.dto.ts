import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateFacultyDto {
  @IsUUID()
  universityId!: string;

  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsBoolean()
  provisionDspace?: boolean;
}
