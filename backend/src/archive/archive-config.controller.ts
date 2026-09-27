import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { ArchiveConfigService } from "./archive-config.service";
import { CreateFacultyDto } from "./dto/create-faculty.dto";
import { CreateSemesterDto } from "./dto/create-semester.dto";
import { CreateSubmissionPeriodDto } from "./dto/create-submission-period.dto";
import { PublishToDspaceDto } from "./dto/publish-to-dspace.dto";
import { UpdateFacultyDto } from "./dto/update-faculty.dto";
import { UpdateSemesterDto } from "./dto/update-semester.dto";
import { UpdateSubmissionPeriodDto } from "./dto/update-submission-period.dto";
import { DspacePublishService } from "./dspace-publish.service";
import { DspaceProvisionerService } from "./dspace-provisioner.service";
import { DspaceSyncService } from "./dspace-sync.service";

@Controller("archive-config")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArchiveConfigController {
  constructor(
    private readonly archiveConfigService: ArchiveConfigService,
    private readonly dspaceSyncService: DspaceSyncService,
    private readonly dspacePublishService: DspacePublishService,
    private readonly dspaceProvisioner: DspaceProvisionerService
  ) {}

  @Get("faculties")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  listFaculties() {
    return this.archiveConfigService.listFaculties();
  }

  @Post("faculties")
  @RequirePermissions("library_intake", "configure_system")
  createFaculty(@Req() req: { user: JwtPayload }, @Body() body: CreateFacultyDto) {
    return this.archiveConfigService.createFaculty(req.user, body);
  }

  @Get("faculties/:facultyId")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  getFaculty(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.getFacultyDetail(facultyId);
  }

  @Patch("faculties/:facultyId")
  @RequirePermissions("library_intake", "configure_system")
  updateFaculty(@Param("facultyId") facultyId: string, @Body() body: UpdateFacultyDto) {
    return this.archiveConfigService.updateFaculty(facultyId, body);
  }

  @Delete("faculties/:facultyId")
  @RequirePermissions("library_intake", "configure_system")
  deleteFaculty(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.deleteFaculty(facultyId);
  }

  @Post("faculties/:facultyId/provision-dspace")
  @RequirePermissions("library_intake", "configure_system")
  provisionFaculty(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.provisionFacultyDspace(facultyId);
  }

  @Post("dspace/sync-from-root")
  @RequirePermissions("library_intake", "configure_system")
  syncFromRoot() {
    return this.dspaceSyncService.syncFromRootCommunity();
  }

  @Get("dspace/diagnose")
  @RequirePermissions("library_intake", "configure_system")
  diagnoseDspace() {
    return this.dspaceProvisioner.diagnoseConnection();
  }

  @Get("dspace/sync-nodes")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  listSyncedDspaceNodes() {
    return this.dspaceSyncService.listSyncedNodes();
  }

  @Get("dspace/publish-queue")
  @RequirePermissions("library_intake", "configure_system")
  listPublishQueue(
    @Query("facultyId") facultyId?: string,
    @Query("semesterId") semesterId?: string,
    @Query("periodId") periodId?: string,
    @Query("dspaceStatus") dspaceStatus?: string
  ) {
    return this.dspacePublishService.listPublishQueue({ facultyId, semesterId, periodId, dspaceStatus });
  }

  @Post("dspace/publish")
  @RequirePermissions("library_intake", "configure_system")
  publishToDspace(@Body() body: PublishToDspaceDto) {
    return this.dspacePublishService.publishSubmissionsToCollection({
      submissionIds: body.submissionIds,
      collectionId: body.collectionId
    });
  }

  @Get("faculties/:facultyId/semesters")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  listSemesters(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.listSemesters(facultyId);
  }

  @Post("faculties/:facultyId/semesters")
  @RequirePermissions("library_intake", "configure_system")
  createSemester(
    @Req() req: { user: JwtPayload },
    @Param("facultyId") facultyId: string,
    @Body() body: CreateSemesterDto
  ) {
    return this.archiveConfigService.createSemester(req.user, facultyId, body);
  }

  @Post("semesters/for-all-faculties")
  @RequirePermissions("library_intake", "configure_system")
  createSemesterForAllFaculties(@Req() req: { user: JwtPayload }, @Body() body: CreateSemesterDto) {
    return this.archiveConfigService.createSemesterForAllFaculties(req.user, body);
  }

  @Get("semesters/:semesterId")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  getSemester(@Param("semesterId") semesterId: string) {
    return this.archiveConfigService.getSemesterDetail(semesterId);
  }

  @Patch("semesters/:semesterId")
  @RequirePermissions("library_intake", "configure_system")
  updateSemester(@Param("semesterId") semesterId: string, @Body() body: UpdateSemesterDto) {
    return this.archiveConfigService.updateSemester(semesterId, body);
  }

  @Delete("semesters/:semesterId")
  @RequirePermissions("library_intake", "configure_system")
  deleteSemester(@Param("semesterId") semesterId: string) {
    return this.archiveConfigService.deleteSemester(semesterId);
  }

  @Get("faculties/:facultyId/submission-periods")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  listSubmissionPeriods(@Param("facultyId") facultyId: string) {
    return this.archiveConfigService.listSubmissionPeriods(facultyId);
  }

  @Post("faculties/:facultyId/submission-periods")
  @RequirePermissions("library_intake", "configure_system")
  createSubmissionPeriod(
    @Req() req: { user: JwtPayload },
    @Param("facultyId") facultyId: string,
    @Body() body: CreateSubmissionPeriodDto
  ) {
    return this.archiveConfigService.createSubmissionPeriod(req.user, facultyId, body);
  }

  @Get("submission-periods/:periodId")
  @RequirePermissions("library_intake", "configure_system", "director_approval", "view_all_submissions")
  getPeriod(@Param("periodId") periodId: string) {
    return this.archiveConfigService.getPeriodDetail(periodId);
  }

  @Patch("submission-periods/:periodId")
  @RequirePermissions("library_intake", "configure_system")
  updatePeriod(@Param("periodId") periodId: string, @Body() body: UpdateSubmissionPeriodDto) {
    return this.archiveConfigService.updateSubmissionPeriod(periodId, body);
  }

  @Delete("submission-periods/:periodId")
  @RequirePermissions("library_intake", "configure_system")
  deletePeriod(@Param("periodId") periodId: string) {
    return this.archiveConfigService.deleteSubmissionPeriod(periodId);
  }

  @Post("submission-periods/:periodId/open")
  @RequirePermissions("library_intake", "configure_system")
  openPeriod(@Param("periodId") periodId: string) {
    return this.archiveConfigService.openSubmissionPeriod(periodId);
  }

  @Post("submission-periods/:periodId/close")
  @RequirePermissions("library_intake", "configure_system")
  closePeriod(@Param("periodId") periodId: string) {
    return this.archiveConfigService.closeSubmissionPeriod(periodId);
  }
}
