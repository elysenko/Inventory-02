import * as request from 'supertest';
import { Role } from '@prisma/client';
import { bootTestApp, purgeItems, purgeUsers, TestContext, uniqueSuffix } from './helpers';

describe('Low-stock report and movement log filters', () => {
  let ctx: TestContext;
  let token: string;
  let email: string;
  let lowId: string;
  let healthyId: string;
  let lowSku: string;
  let healthySku: string;
  let locA: string;
  let locB: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ctx = await bootTestApp();
    email = `e2e-report-${uniqueSuffix()}@demo`;
    await request(ctx.app.getHttpServer())
      .post('/api/auth/signup').send({ name: 'Report Manager', email, password: 'Demo1234!' }).expect(201);
    await ctx.prisma.user.update({ where: { email }, data: { role: Role.MANAGER } });
    token = (await request(ctx.app.getHttpServer())
      .post('/api/auth/login').send({ email, password: 'Demo1234!' }).expect(200)).body.token;

    const locations = await request(ctx.app.getHttpServer()).get('/api/locations').set(auth()).expect(200);
    locA = locations.body[0].id;
    locB = locations.body[1].id;

    // reorderAt 10, 12 on hand, then issue 5 -> 7 on hand, which is below the
    // reorder point and must therefore appear in the report.
    lowSku = `E2E-LOW-${uniqueSuffix()}`;
    lowId = (await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku: lowSku, name: 'Runs Low', reorderAt: 10 }).expect(201)).body.id;
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'IN', itemId: lowId, toLocId: locA, qty: 12 }).expect(201);
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'OUT', itemId: lowId, fromLocId: locA, qty: 5 }).expect(201);

    // reorderAt 10 with 40 on hand — comfortably stocked, must not appear.
    healthySku = `E2E-OK-${uniqueSuffix()}`;
    healthyId = (await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku: healthySku, name: 'Well Stocked', reorderAt: 10 }).expect(201)).body.id;
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'IN', itemId: healthyId, toLocId: locB, qty: 40 }).expect(201);
  });

  afterAll(async () => {
    await purgeItems(ctx, [lowId, healthyId]);
    await purgeUsers(ctx, [email]);
    await ctx.app.close();
  });

  it('lists an item that has fallen to or below its reorder point', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/reports/low-stock').set(auth()).expect(200);
    const row = res.body.find((r: { sku: string }) => r.sku === lowSku);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ reorderAt: 10, totalQty: 7, shortfall: 3 });
  });

  it('omits a well-stocked item', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/reports/low-stock').set(auth()).expect(200);
    expect(res.body.some((r: { sku: string }) => r.sku === healthySku)).toBe(false);
  });

  it('only ever reports rows that satisfy totalQty <= reorderAt, deepest shortfall first', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/reports/low-stock').set(auth()).expect(200);
    const rows: { totalQty: number; reorderAt: number; shortfall: number }[] = res.body;
    expect(rows.every((r) => r.totalQty <= r.reorderAt)).toBe(true);
    const shortfalls = rows.map((r) => r.shortfall);
    expect(shortfalls).toEqual([...shortfalls].sort((a, b) => b - a));
  });

  it('filters the movement log by item', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/movements?itemId=${lowId}`).set(auth()).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.rows.every((r: { itemId: string }) => r.itemId === lowId)).toBe(true);
  });

  it('filters the movement log by type', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/movements?itemId=${lowId}&type=OUT`).set(auth()).expect(200);
    expect(res.body.rows.every((r: { type: string }) => r.type === 'OUT')).toBe(true);
    expect(res.body.total).toBe(1);
  });

  it('filters the movement log by date range', async () => {
    const empty = await request(ctx.app.getHttpServer())
      .get('/api/movements?from=2000-01-01&to=2000-01-02').set(auth()).expect(200);
    expect(empty.body.total).toBe(0);

    // A date-only upper bound must include everything recorded during that day.
    const today = new Date().toISOString().slice(0, 10);
    const covering = await request(ctx.app.getHttpServer())
      .get(`/api/movements?itemId=${lowId}&from=${today}&to=${today}`).set(auth()).expect(200);
    expect(covering.body.total).toBe(2);
  });

  it('returns the log newest-first and paginated', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/movements').set(auth()).expect(200);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.page).toBe(1);
    const dates = res.body.rows.map((r: { createdAt: string }) => r.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});
