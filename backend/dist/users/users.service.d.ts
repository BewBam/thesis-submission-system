export type UserRole = "student" | "reviewer" | "admin";
export interface UserRecord {
    id: string;
    username: string;
    displayName: string;
    password: string;
    role: UserRole;
}
export declare class UsersService {
    private readonly db;
    findByUsername(username: string): Promise<UserRecord | undefined>;
    findById(id: string): Promise<UserRecord | undefined>;
    listByRole(role: UserRole): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: UserRole;
    }[]>;
}
