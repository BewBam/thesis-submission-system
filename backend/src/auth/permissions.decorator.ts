import { SetMetadata } from "@nestjs/common";
import type { Permission } from "../users/permissions";

export const PERMISSIONS_KEY = "permissions";

/** User must have at least one of the listed permissions (OR). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
