import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ReviewActionDto } from "./dto/review-action.dto";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("my-queue")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("reviewer")
  myQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getMyQueue(req.user);
  }

  @Post("action")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("reviewer")
  act(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.act(req.user, body);
  }

  @Get("admin-queue")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  adminQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getAdminQueue(req.user);
  }

  @Post("admin-action")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  adminAct(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.adminAct(req.user, body);
  }
}
