import type { JwtPayload } from "../auth/jwt.strategy";
import { AdminRolesService } from "./admin-roles.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminUsersService } from "./admin-users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
export declare class AdminController {
    private readonly adminUsersService;
    private readonly adminRolesService;
    private readonly adminSettingsService;
    constructor(adminUsersService: AdminUsersService, adminRolesService: AdminRolesService, adminSettingsService: AdminSettingsService);
    listUsers(): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        status: string;
        createdAt: Date;
    }[]>;
    createUser(body: CreateUserDto): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        status: string;
    }>;
    updateUser(req: {
        user: JwtPayload;
    }, userId: string, body: UpdateUserDto): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        status: string;
        createdAt: Date;
    }>;
    listRoles(): Promise<{
        role: import("../users/user-role").UserRole;
        permissions: Record<string, boolean>;
    }[]>;
    rolesMeta(): {
        roles: readonly ["student", "reviewer", "library_staff", "director", "admin"];
    };
    updateRolePermissions(role: string, body: UpdateRolePermissionsDto): Promise<{
        role: import("../users/user-role").UserRole;
        permissions: Record<string, boolean>;
    } | undefined>;
    listSettings(): Promise<{
        key: string;
        value: string;
        description: string;
        updatedAt: Date;
    }[]>;
    updateSettings(body: UpdateSettingsDto): Promise<{
        key: string;
        value: string;
        description: string;
        updatedAt: Date;
    }[]>;
}
