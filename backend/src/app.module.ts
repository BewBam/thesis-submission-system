import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { AppController } from "./app.controller";
import { SubmissionsModule } from "./submissions/submissions.module";
import { ReviewsModule } from "./reviews/reviews.module";

@Module({
  imports: [AuthModule, UsersModule, SubmissionsModule, ReviewsModule],
  controllers: [AppController]
})
export class AppModule {}
