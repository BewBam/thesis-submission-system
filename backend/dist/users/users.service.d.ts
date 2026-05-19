import type { UserRole } from "./user-role";
export type { UserRole } from "./user-role";
export interface UserRecord {
    id: string;
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
    status: "active" | "disabled";
}
export declare class UsersService {
    private readonly db;
    findByUsername(username: string): Promise<UserRecord | undefined>;
    findById(id: string): Promise<UserRecord | undefined>;
    listByRole(role: UserRole): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
    }[]>;
}
