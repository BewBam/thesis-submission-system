import { Strategy } from "passport-jwt";
export type JwtPayload = {
    sub: string;
    username: string;
    displayName?: string;
    role: "student" | "reviewer" | "library_staff" | "director" | "admin";
};
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    constructor();
    validate(payload: JwtPayload): JwtPayload;
}
export {};
