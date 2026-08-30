import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AuthUser, JwtPayload } from './auth-user.interface';

const BCRYPT_COST = 10;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? user.email,
      role: user.role,
    };
  }

  async signup(dto: SignupDto): Promise<AuthResponse> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    // The very first account to exist bootstraps the system and gets full
    // manager-level authority; everyone after it is a clerk. The seed runs
    // before any signup, so demo signups are always clerks.
    const isFirstUser = (await this.prisma.user.count()) === 0;
    const role: Role = isFirstUser ? Role.ADMIN : Role.CLERK;

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name?.length ? dto.name : dto.email.split('@')[0],
          passwordHash,
          role,
        },
      });
      return this.issue(user);
    } catch (error) {
      // A concurrent signup with the same address loses the unique-index race
      // rather than creating a second row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with that email already exists.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Identical failure for "no such user" and "wrong password" so the endpoint
    // cannot be used to enumerate registered addresses.
    if (!user?.passwordHash) throw new UnauthorizedException('Incorrect email or password.');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Incorrect email or password.');

    return this.issue(user);
  }

  async me(principal: AuthUser): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');
    return AuthService.toPublicUser(user);
  }

  private issue(user: User): AuthResponse {
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { token: this.jwt.sign(payload), user: AuthService.toPublicUser(user) };
  }
}
