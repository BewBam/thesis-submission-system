import { IsIn, IsString, MinLength } from "class-validator";
import { USER_ROLES } from "../../users/user-role";
import { IsOptionalFacultyId } from "./is-faculty-id";

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsIn([...USER_ROLES])
  role!: (typeof USER_ROLES)[number];

  @IsOptionalFacultyId()
  facultyId?: string | null;
}
