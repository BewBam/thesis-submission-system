import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ReviewActionDto } from "./dto/review-action.dto";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("my-queue")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("review_academic")
  myQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getMyQueue(req.user);
  }

  @Post("action")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("review_academic")
  act(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.act(req.user, body);
  }

  @Get("library-queue")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("library_intake")
  libraryQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getLibraryQueue(req.user);
  }

  @Post("library-action")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("library_intake")
  libraryAct(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.libraryAct(req.user, body);
  }

  @Get("director-queue")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("director_approval")
  directorQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getDirectorQueue(req.user);
  }

  @Post("director-action")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("director_approval")
  directorAct(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.directorAct(req.user, body);
  }
}
