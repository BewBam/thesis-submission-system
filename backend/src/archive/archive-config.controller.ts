import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ArchiveConfigService } from "./archive-config.service";
import { CreateFacultyDto } from "./dto/create-faculty.dto";
import { CreateSemesterDto } from "./dto/create-semester.dto";
import { CreateSubmissionPeriodDto } from "./dto/create-submission-period.dto";
import { UpdateFacultyDto } from "./dto/update-faculty.dto";

@Controller("archive-config")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArchiveConfigController {
  constructor(private readonly archiveConfigService: ArchiveConfigService) {}

  @Get("universities")
  @Roles("library_staff", "admin", "director")
  listUniversities() {
    return this.archiveConfigService.listUniversities();
  }

  @Get("faculties")
  @Roles("library_staff", "admin", "director")
  listFaculties() {
    return this.archiveConfigService.listFaculties();
  }

  @Post("faculties")
  @Roles("library_staff", "admin")
  createFaculty(@Req() req: { user: JwtPayload }, @Body() body: CreateFacultyDto) {
    return this.archiveConfigService.createFaculty(req.user, body);
  }

  @Patch("faculties/:facultyId")
  @Roles("library_staff", "admin")
  updateFaculty(@Param("facultyId") facultyId: string, @Body() body: UpdateFacultyDto) {
    return this.archiveConfigService.updateFaculty(facultyId, body);
  }

  @Post("faculties/:facultyId/provision-dspace")
  @Roles("library_staff", "admin")
  provisionFaculty(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.provisionFacultyDspace(facultyId);
  }

  @Get("faculties/:facultyId/semesters")
  @Roles("library_staff", "admin", "director")
  listSemesters(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.listSemesters(facultyId);
  }

  @Post("faculties/:facultyId/semesters")
  @Roles("library_staff", "admin")
  createSemester(
    @Req() req: { user: JwtPayload },
    @Param("facultyId") facultyId: string,
    @Body() body: CreateSemesterDto
  ) {
    return this.archiveConfigService.createSemester(req.user, facultyId, body);
  }

  @Get("faculties/:facultyId/submission-periods")
  @Roles("library_staff", "admin", "director")
  listSubmissionPeriods(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.listSubmissionPeriods(facultyId);
  }

  @Post("faculties/:facultyId/submission-periods")
  @Roles("library_staff", "admin")
  createSubmissionPeriod(
    @Req() req: { user: JwtPayload },
    @Param("facultyId") facultyId: string,
    @Body() body: CreateSubmissionPeriodDto
  ) {
    return this.archiveConfigService.createSubmissionPeriod(req.user, facultyId, body);
  }

  @Post("submission-periods/:periodId/open")
  @Roles("library_staff", "admin")
  openPeriod(@Param("periodId") periodId: string) {
    return this.archiveConfigService.openSubmissionPeriod(periodId);
  }

  @Post("submission-periods/:periodId/close")
  @Roles("library_staff", "admin")
  closePeriod(@Param("periodId") periodId: string) {
    return this.archiveConfigService.closeSubmissionPeriod(periodId);
  }
}
