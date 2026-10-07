import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermissions } from "../auth/permissions.decorator";
import type { JwtPayload } from "../auth/jwt.strategy";
import { CreateFormFieldDto } from "../submissions/dto/create-form-field.dto";
import { UpdateFormFieldDto } from "../submissions/dto/update-form-field.dto";
import { SubmissionFormFieldsService } from "../submissions/submission-form-fields.service";
import { USER_ROLES } from "../users/user-role";
import { AdminRolesService } from "./admin-roles.service";
import { AdminSettingsService } from "./admin-settings.service";
import { AdminUsersService } from "./admin-users.service";
import { ConfirmImportUsersDto } from "./dto/confirm-import-users.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateGroupDto, SetGroupGrantsDto, SetGroupMembersDto } from "../workflow/dto/group.dto";
import { SaveWorkflowDto } from "../workflow/dto/save-workflow.dto";
import { GroupsService } from "../workflow/groups.service";
import { WorkflowService } from "../workflow/workflow.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly adminRolesService: AdminRolesService,
    private readonly adminSettingsService: AdminSettingsService,
    private readonly formFieldsService: SubmissionFormFieldsService,
    private readonly workflowService: WorkflowService,
    private readonly groupsService: GroupsService
  ) {}

  @Get("users")
  @RequirePermissions("manage_users")
  listUsers() {
    return this.adminUsersService.listAll();
  }

  @Post("users")
  @RequirePermissions("manage_users")
  createUser(@Body() body: CreateUserDto) {
    return this.adminUsersService.create(body);
  }

  @Get("users/export")
  @RequirePermissions("manage_users")
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @Header("Content-Disposition", 'attachment; filename="users.xlsx"')
  async exportUsers() {
    const buffer = await this.adminUsersService.buildUsersExport();
    return new StreamableFile(buffer);
  }

  @Get("users/import-template")
  @RequirePermissions("manage_users")
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @Header("Content-Disposition", 'attachment; filename="users-import-template.xlsx"')
  async downloadUserImportTemplate() {
    const buffer = await this.adminUsersService.buildImportTemplate();
    return new StreamableFile(buffer);
  }

  @Post("users/import/preview")
  @RequirePermissions("manage_users")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/\.(xlsx|csv)$/i.test(file.originalname || "")) {
          cb(new BadRequestException("File must be .xlsx or .csv"), false);
          return;
        }
        cb(null, true);
      }
    })
  )
  previewImportUsers(@UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("A .xlsx or .csv file is required");
    }
    return this.adminUsersService.previewImport(file.buffer, file.originalname || "");
  }

  @Post("users/import")
  @RequirePermissions("manage_users")
  confirmImportUsers(@Body() body: ConfirmImportUsersDto) {
    return this.adminUsersService.confirmImport(body.users);
  }

  @Patch("users/:userId")
  @RequirePermissions("manage_users")
  updateUser(@Req() req: { user: JwtPayload }, @Param("userId") userId: string, @Body() body: UpdateUserDto) {
    return this.adminUsersService.update(req.user.sub, userId, body);
  }

  @Delete("users/:userId")
  @RequirePermissions("manage_users")
  deleteUser(@Req() req: { user: JwtPayload }, @Param("userId") userId: string) {
    return this.adminUsersService.remove(req.user.sub, userId);
  }

  @Get("roles")
  @RequirePermissions("manage_roles")
  listRoles() {
    return this.adminRolesService.listRolesWithPermissions();
  }

  @Get("roles/meta")
  @RequirePermissions("manage_roles")
  rolesMeta() {
    return { roles: USER_ROLES };
  }

  @Put("roles/:role")
  @RequirePermissions("manage_roles")
  updateRolePermissions(@Param("role") role: string, @Body() body: UpdateRolePermissionsDto) {
    return this.adminRolesService.updateRolePermissions(role, body.permissions);
  }

  @Get("settings")
  @RequirePermissions("configure_system")
  listSettings() {
    return this.adminSettingsService.list();
  }

  @Patch("settings")
  @RequirePermissions("configure_system")
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.adminSettingsService.update(body.settings);
  }

  @Get("submission-form-fields")
  @RequirePermissions("configure_system")
  listFormFields() {
    return this.formFieldsService.listAll();
  }

  @Post("submission-form-fields")
  @RequirePermissions("configure_system")
  createFormField(@Body() body: CreateFormFieldDto) {
    return this.formFieldsService.create(body);
  }

  @Patch("submission-form-fields/:fieldId")
  @RequirePermissions("configure_system")
  updateFormField(@Param("fieldId") fieldId: string, @Body() body: UpdateFormFieldDto) {
    return this.formFieldsService.update(fieldId, body);
  }

  @Delete("submission-form-fields/:fieldId")
  @RequirePermissions("configure_system")
  deleteFormField(@Param("fieldId") fieldId: string) {
    return this.formFieldsService.remove(fieldId);
  }

  @Get("workflow")
  @RequirePermissions("configure_system")
  listWorkflow() {
    return this.workflowService.listTemplate();
  }

  @Put("workflow")
  @RequirePermissions("configure_system")
  saveWorkflow(@Body() body: SaveWorkflowDto) {
    return this.workflowService.saveTemplate(body.steps);
  }

  @Get("groups")
  @RequirePermissions("configure_system")
  listGroups() {
    return this.groupsService.list();
  }

  @Post("groups")
  @RequirePermissions("configure_system")
  createGroup(@Body() body: CreateGroupDto) {
    return this.groupsService.create(body.name, body.kind);
  }

  @Delete("groups/:groupId")
  @RequirePermissions("configure_system")
  deleteGroup(@Param("groupId") groupId: string) {
    return this.groupsService.remove(groupId);
  }

  @Put("groups/:groupId/members")
  @RequirePermissions("configure_system")
  setGroupMembers(@Param("groupId") groupId: string, @Body() body: SetGroupMembersDto) {
    return this.groupsService.setMembers(groupId, body.userIds);
  }

  @Put("groups/:groupId/grants")
  @RequirePermissions("configure_system")
  setGroupGrants(@Param("groupId") groupId: string, @Body() body: SetGroupGrantsDto) {
    return this.groupsService.setGrants(groupId, body.studentGroupIds);
  }
}
