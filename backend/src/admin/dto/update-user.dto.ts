import { IsIn, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from "class-validator";
import { USER_ROLES } from "../../users/user-role";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsIn([...USER_ROLES])
  role?: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(["active", "disabled"])
  status?: "active" | "disabled";

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsUUID()
  facultyId?: string | null;
}
