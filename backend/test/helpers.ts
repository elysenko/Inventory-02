import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  url: string;
}

/**
 * Boots the real application — global guards, pipes and prefix included — so the
 * suite exercises the same request path production does. A test that bypassed
 * the global JwtAuthGuard could not prove the 401-by-default requirement at all.
 */
export async function bootTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return { app, prisma: app.get(PrismaService), url: '/api' };
}

/** Unique per run so parallel or repeated runs never collide on a unique index. */
export const uniqueSuffix = (): string => Math.random().toString(36).slice(2, 10);

/**
 * Teardown guard.
 *
 * `deleteMany({ where: { id: undefined } })` is not a no-op in Prisma — an
 * undefined filter is dropped, so the call matches EVERY row and truncates the
 * table. When a `beforeAll` throws, the ids it was meant to assign are undefined
 * but `afterAll` still runs, so a single setup failure can wipe the database the
 * suite is pointed at. Collecting ids through this helper makes that impossible.
 */
export function definedIds(...ids: (string | undefined | null)[]): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Deletes an item and everything referencing it — only for ids that exist. */
export async function purgeItems(ctx: TestContext, ids: (string | undefined | null)[]): Promise<void> {
  const safe = definedIds(...ids);
  if (safe.length === 0) return;
  await ctx.prisma.movement.deleteMany({ where: { itemId: { in: safe } } });
  await ctx.prisma.stockLevel.deleteMany({ where: { itemId: { in: safe } } });
  await ctx.prisma.item.deleteMany({ where: { id: { in: safe } } });
}

/** Deletes users by email — only for addresses that were actually created. */
export async function purgeUsers(ctx: TestContext, emails: (string | undefined | null)[]): Promise<void> {
  const safe = definedIds(...emails);
  if (safe.length === 0) return;
  await ctx.prisma.user.deleteMany({ where: { email: { in: safe } } });
}
