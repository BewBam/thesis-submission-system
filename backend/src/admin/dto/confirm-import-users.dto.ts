import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested
} from "class-validator";
import { USER_ROLES } from "../../users/user-role";
import { IsOptionalFacultyId } from "./is-faculty-id";

export class ImportUserRowDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsIn([...USER_ROLES])
  role!: (typeof USER_ROLES)[number];

  @IsOptionalFacultyId()
  facultyId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(["active", "disabled"])
  status?: "active" | "disabled";
}

export class ImportGroupAssignmentDto {
  @IsIn(["student", "reviewer"])
  kind!: "student" | "reviewer";

  @IsIn(["existing", "new"])
  mode!: "existing" | "new";

  @ValidateIf((value: ImportGroupAssignmentDto) => value.mode === "existing")
  @IsString()
  @MinLength(1)
  groupId?: string;

  @ValidateIf((value: ImportGroupAssignmentDto) => value.mode === "new")
  @IsString()
  @MinLength(1)
  name?: string;
}

export class ConfirmImportUsersDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportUserRowDto)
  users!: ImportUserRowDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ImportGroupAssignmentDto)
  groups?: ImportGroupAssignmentDto[];
}
