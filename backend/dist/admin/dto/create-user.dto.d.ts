import { USER_ROLES } from "../../users/user-role";
export declare class CreateUserDto {
    username: string;
    password: string;
    displayName: string;
    role: (typeof USER_ROLES)[number];
}
