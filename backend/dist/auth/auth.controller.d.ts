import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(body: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            username: string;
            displayName: string;
            role: import("../users/users.service").UserRole;
        };
    }>;
}
