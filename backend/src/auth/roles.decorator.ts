import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts a route to the listed roles. Enforced by RolesGuard. */
export const Roles = (...roles: Role[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);

/**
 * "Manager-level" is ADMIN or MANAGER. Every management, report and audit-log
 * route uses this so an ADMIN is never locked out of a manager screen.
 */
export const MANAGER_ROLES: Role[] = [Role.ADMIN, Role.MANAGER];
