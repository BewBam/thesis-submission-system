export declare const USER_ROLES: readonly ["student", "reviewer", "library_staff", "director", "admin"];
export type UserRole = (typeof USER_ROLES)[number];
export declare function isUserRole(value: string): value is UserRole;
