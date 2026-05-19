import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
export declare class AdminUsersService {
    private readonly db;
    listAll(): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        status: string;
        createdAt: Date;
    }[]>;
    create(dto: CreateUserDto): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        status: string;
    }>;
    update(actorId: string, userId: string, dto: UpdateUserDto): Promise<{
        id: string;
        username: string;
        displayName: string;
        role: "student" | "reviewer" | "library_staff" | "director" | "admin";
        status: string;
        createdAt: Date;
    }>;
}
