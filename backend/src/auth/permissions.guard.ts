import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "../users/permissions";
import { PermissionsService } from "../users/permissions.service";
import type { JwtPayload } from "./jwt.strategy";
import { PERMISSIONS_KEY } from "./permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user?.role) {
      throw new UnauthorizedException();
    }

    const allowed = await this.permissionsService.roleHasAnyPermission(user.role, required);
    if (!allowed) {
      throw new ForbiddenException(
        `Missing required permission (one of: ${required.join(", ")})`
      );
    }
    return true;
  }
}
