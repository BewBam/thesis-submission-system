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

  @Get("library-queue")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("library_staff")
  libraryQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getLibraryQueue(req.user);
  }

  @Post("library-action")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("library_staff")
  libraryAct(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.libraryAct(req.user, body);
  }

  @Get("director-queue")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("director")
  directorQueue(@Req() req: { user: JwtPayload }) {
    return this.reviewsService.getDirectorQueue(req.user);
  }

  @Post("director-action")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("director")
  directorAct(@Req() req: { user: JwtPayload }, @Body() body: ReviewActionDto) {
    return this.reviewsService.directorAct(req.user, body);
  }
}
