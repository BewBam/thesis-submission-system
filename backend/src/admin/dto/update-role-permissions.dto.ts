import { IsObject } from "class-validator";

export class UpdateRolePermissionsDto {
  @IsObject()
  permissions!: Record<string, boolean>;
}
