import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import { SubmissionPeriodsService } from "./submission-periods.service";

@Controller("archive")
export class ArchiveController {
  constructor(private readonly submissionPeriodsService: SubmissionPeriodsService) {}

  @Get("faculties")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("submit_thesis", "configure_system")
  listFaculties() {
    return this.submissionPeriodsService.listFacultiesWithOpenPeriods();
  }

  @Get("faculties/:facultyId/semesters")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("submit_thesis", "configure_system")
  listSemesters(@Param("facultyId") facultyId: string) {
    return this.submissionPeriodsService.listSemestersWithOpenPeriods(facultyId);
  }

  @Get("submission-periods")
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions("submit_thesis", "configure_system")
  listOpenPeriods(@Query("facultyId") facultyId: string, @Query("semesterId") semesterId: string) {
    if (!facultyId || !semesterId) {
      return [];
    }
    return this.submissionPeriodsService.listOpenPeriods(facultyId, semesterId);
  }
}
