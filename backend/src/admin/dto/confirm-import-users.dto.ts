import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from "class-validator";
import { USER_ROLES } from "../../users/user-role";

export class ImportUserRowDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsIn([...USER_ROLES])
  role!: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsUUID()
  facultyId?: string | null;
}

export class ConfirmImportUsersDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportUserRowDto)
  users!: ImportUserRowDto[];
}
