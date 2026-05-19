import { Module } from "@nestjs/common";
import { ArchiveModule } from "../archive/archive.module";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../auth/roles.guard";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [AuthModule, ArchiveModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, RolesGuard]
})
export class ReviewsModule {}
