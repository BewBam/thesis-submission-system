import { type UserRole } from "../users/user-role";
export declare class AdminRolesService {
    private readonly db;
    listRolesWithPermissions(): Promise<{
        role: UserRole;
        permissions: Record<string, boolean>;
    }[]>;
    updateRolePermissions(role: string, permissions: Record<string, boolean>): Promise<{
        role: UserRole;
        permissions: Record<string, boolean>;
    } | undefined>;
}
