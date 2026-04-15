import { Injectable } from "@nestjs/common";

export type UserRole = "student" | "reviewer" | "admin";

export interface UserRecord {
  id: string;
  username: string;
  password: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  private readonly users: UserRecord[] = [
    { id: "u1", username: "student1", password: "student123", role: "student" },
    { id: "u2", username: "reviewer1", password: "review123", role: "reviewer" },
    { id: "u3", username: "admin1", password: "admin123", role: "admin" }
  ];

  findByUsername(username: string): UserRecord | undefined {
    return this.users.find((u) => u.username === username);
  }
}
