import { Role } from '@prisma/client';

/** Shape attached to `request.user` by JwtStrategy.validate(). */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
