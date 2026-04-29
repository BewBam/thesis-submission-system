import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../auth/roles.guard";
import { UsersModule } from "../users/users.module";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, RolesGuard]
})
export class SubmissionsModule {}
