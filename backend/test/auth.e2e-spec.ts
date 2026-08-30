import * as request from 'supertest';
import { Role } from '@prisma/client';
import { bootTestApp, purgeUsers, TestContext, uniqueSuffix } from './helpers';

describe('Authentication and role gates', () => {
  let ctx: TestContext;
  let clerkToken: string;
  let managerToken: string;
  const created: string[] = [];

  beforeAll(async () => {
    ctx = await bootTestApp();

    const suffix = uniqueSuffix();
    const clerkEmail = `e2e-clerk-${suffix}@demo`;
    const managerEmail = `e2e-manager-${suffix}@demo`;

    const clerk = await request(ctx.app.getHttpServer())
      .post('/api/auth/signup')
      .send({ name: 'E2E Clerk', email: clerkEmail, password: 'Demo1234!' })
      .expect(201);
    clerkToken = clerk.body.token;
    created.push(clerkEmail);

    // Promote a second account so the manager-side assertions have a subject.
    const manager = await request(ctx.app.getHttpServer())
      .post('/api/auth/signup')
      .send({ name: 'E2E Manager', email: managerEmail, password: 'Demo1234!' })
      .expect(201);
    created.push(managerEmail);
    await ctx.prisma.user.update({ where: { email: managerEmail }, data: { role: Role.MANAGER } });
    const relogin = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: managerEmail, password: 'Demo1234!' })
      .expect(200);
    managerToken = relogin.body.token;
  });

  afterAll(async () => {
    await purgeUsers(ctx, created);
    await ctx.app.close();
  });

  it('rejects unauthenticated access to every data endpoint', async () => {
    for (const path of ['/api/items', '/api/locations', '/api/movements', '/api/reports/low-stock']) {
      await request(ctx.app.getHttpServer()).get(path).expect(401);
    }
  });

  it('leaves health endpoints public', async () => {
    await request(ctx.app.getHttpServer()).get('/api/health').expect(200);
    await request(ctx.app.getHttpServer()).get('/api/health/deep').expect(200);
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const unknown = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `nobody-${uniqueSuffix()}@demo`, password: 'Demo1234!' })
      .expect(401);
    const wrongPassword = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: created[0], password: 'not-the-password' })
      .expect(401);
    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it('assigns CLERK to every signup after the first account exists', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${clerkToken}`).expect(200);
    expect(res.body.role).toBe(Role.CLERK);
  });

  it('lets a clerk read the catalog but not manage it', async () => {
    await request(ctx.app.getHttpServer()).get('/api/items').set('Authorization', `Bearer ${clerkToken}`).expect(200);
    await request(ctx.app.getHttpServer())
      .post('/api/items')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ sku: `E2E-${uniqueSuffix()}`, name: 'Forbidden' })
      .expect(403);
  });

  it('hides the audit log and reports from clerks', async () => {
    await request(ctx.app.getHttpServer()).get('/api/movements').set('Authorization', `Bearer ${clerkToken}`).expect(403);
    await request(ctx.app.getHttpServer()).get('/api/reports/low-stock').set('Authorization', `Bearer ${clerkToken}`).expect(403);
  });

  it('grants managers the log and the report', async () => {
    await request(ctx.app.getHttpServer()).get('/api/movements').set('Authorization', `Bearer ${managerToken}`).expect(200);
    await request(ctx.app.getHttpServer()).get('/api/reports/low-stock').set('Authorization', `Bearer ${managerToken}`).expect(200);
  });

  it('keeps admin settings to admins only', async () => {
    await request(ctx.app.getHttpServer()).get('/api/admin/settings').set('Authorization', `Bearer ${managerToken}`).expect(403);
    await request(ctx.app.getHttpServer()).get('/api/admin/settings').set('Authorization', `Bearer ${clerkToken}`).expect(403);
  });

  it('rejects a garbage bearer token', async () => {
    await request(ctx.app.getHttpServer()).get('/api/items').set('Authorization', 'Bearer not.a.jwt').expect(401);
  });
});
