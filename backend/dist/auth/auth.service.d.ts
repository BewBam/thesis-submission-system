import { JwtService } from "@nestjs/jwt";
import { LoginDto } from "./dto/login.dto";
import { UsersService } from "../users/users.service";
export declare class AuthService {
    private readonly usersService;
    private readonly jwtService;
    constructor(usersService: UsersService, jwtService: JwtService);
    login(payload: LoginDto): Promise<{
        access_token: string;
        user: {
            id: string;
            username: string;
            displayName: string;
            role: import("../users/users.service").UserRole;
        };
    }>;
}
