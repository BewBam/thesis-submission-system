import { JwtService } from "@nestjs/jwt";
import { AdminSettingsService } from "../admin/admin-settings.service";
import { LoginDto } from "./dto/login.dto";
import { UsersService } from "../users/users.service";
export declare class AuthService {
    private readonly usersService;
    private readonly jwtService;
    private readonly adminSettingsService;
    constructor(usersService: UsersService, jwtService: JwtService, adminSettingsService: AdminSettingsService);
    login(payload: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            username: string;
            displayName: string;
            role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        };
    }>;
}
