import { USER_ROLES } from "../../users/user-role";
export declare class UpdateUserDto {
    displayName?: string;
    role?: (typeof USER_ROLES)[number];
    password?: string;
    status?: "active" | "disabled";
}
