import { UsersService } from "./users.service";
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    listByRole(role: string): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
    }[]>;
}
