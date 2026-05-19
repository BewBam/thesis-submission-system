import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { SubmissionPeriodsService } from "./submission-periods.service";

@Controller("archive")
export class ArchiveController {
  constructor(private readonly submissionPeriodsService: SubmissionPeriodsService) {}

  @Get("faculties")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  listFaculties() {
    return this.submissionPeriodsService.listFacultiesWithOpenPeriods();
  }

  @Get("faculties/:facultyId/semesters")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  listSemesters(@Param("facultyId") facultyId: string) {
    return this.submissionPeriodsService.listSemestersWithOpenPeriods(facultyId);
  }

  @Get("submission-periods")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("student")
  listOpenPeriods(@Query("facultyId") facultyId: string, @Query("semesterId") semesterId: string) {
    if (!facultyId || !semesterId) {
      return [];
    }
    return this.submissionPeriodsService.listOpenPeriods(facultyId, semesterId);
  }
}
