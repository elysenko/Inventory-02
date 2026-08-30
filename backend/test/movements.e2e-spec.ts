import * as request from 'supertest';
import { Role } from '@prisma/client';
import { bootTestApp, purgeItems, purgeUsers, TestContext, uniqueSuffix } from './helpers';

describe('Stock movements', () => {
  let ctx: TestContext;
  let token: string;
  let email: string;
  let itemId: string;
  let sku: string;
  let locA: string;
  let locB: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const qtyAt = async (locationId: string): Promise<number> => {
    const level = await ctx.prisma.stockLevel.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
    });
    return level?.qty ?? 0;
  };

  beforeAll(async () => {
    ctx = await bootTestApp();
    email = `e2e-move-${uniqueSuffix()}@demo`;
    await request(ctx.app.getHttpServer())
      .post('/api/auth/signup').send({ name: 'Move Manager', email, password: 'Demo1234!' }).expect(201);
    await ctx.prisma.user.update({ where: { email }, data: { role: Role.MANAGER } });
    token = (await request(ctx.app.getHttpServer())
      .post('/api/auth/login').send({ email, password: 'Demo1234!' }).expect(200)).body.token;

    sku = `E2E-MOVE-${uniqueSuffix()}`;
    const item = await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku, name: 'Movement Subject', reorderAt: 0 }).expect(201);
    itemId = item.body.id;

    const locations = await request(ctx.app.getHttpServer()).get('/api/locations').set(auth()).expect(200);
    locA = locations.body[0].id;
    locB = locations.body[1].id;
  });

  afterAll(async () => {
    await purgeItems(ctx, [itemId]);
    await purgeUsers(ctx, [email]);
    await ctx.app.close();
  });

  it('IN 50 raises the balance to 50 and writes one audit entry', async () => {
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'IN', itemId, toLocId: locA, qty: 50 }).expect(201);

    expect(await qtyAt(locA)).toBe(50);
    const log = await request(ctx.app.getHttpServer())
      .get(`/api/movements?itemId=${itemId}`).set(auth()).expect(200);
    expect(log.body.total).toBe(1);
    expect(log.body.rows[0]).toMatchObject({ type: 'IN', qty: 50, itemSku: sku });
    expect(log.body.rows[0].userName).toBeTruthy();
  });

  it('OUT 20 lowers the balance to 30', async () => {
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'OUT', itemId, fromLocId: locA, qty: 20 }).expect(201);
    expect(await qtyAt(locA)).toBe(30);
  });

  it('TRANSFER 10 moves stock between locations without changing the total', async () => {
    const before = (await qtyAt(locA)) + (await qtyAt(locB));
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'TRANSFER', itemId, fromLocId: locA, toLocId: locB, qty: 10 }).expect(201);

    expect(await qtyAt(locA)).toBe(20);
    expect(await qtyAt(locB)).toBe(10);
    expect((await qtyAt(locA)) + (await qtyAt(locB))).toBe(before);
  });

  it('refuses an OUT larger than the balance and leaves the stored balance untouched', async () => {
    const before = await qtyAt(locA);
    const res = await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'OUT', itemId, fromLocId: locA, qty: before + 10 }).expect(400);

    expect(String(res.body.message)).toMatch(/insufficient stock/i);
    // The rejection must roll back cleanly: no partial debit, and no audit row
    // claiming a movement that never happened.
    expect(await qtyAt(locA)).toBe(before);
    const log = await request(ctx.app.getHttpServer())
      .get(`/api/movements?itemId=${itemId}&type=OUT`).set(auth()).expect(200);
    expect(log.body.rows.every((r: { qty: number }) => r.qty <= before)).toBe(true);
  });

  it('refuses an OUT from a location holding nothing', async () => {
    const emptyLocation = await ctx.prisma.location.create({
      data: { name: `E2E Empty ${uniqueSuffix()}`, zone: 'test' },
    });
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'OUT', itemId, fromLocId: emptyLocation.id, qty: 1 }).expect(400);
    expect(await qtyAt(emptyLocation.id)).toBe(0);
    await ctx.prisma.location.delete({ where: { id: emptyLocation.id } });
  });

  it('enforces the endpoint rules for each movement type', async () => {
    const bad = [
      { type: 'IN', itemId, qty: 1 },
      { type: 'OUT', itemId, qty: 1 },
      { type: 'TRANSFER', itemId, fromLocId: locA, qty: 1 },
      { type: 'TRANSFER', itemId, fromLocId: locA, toLocId: locA, qty: 1 },
      { type: 'IN', itemId, toLocId: locA, qty: 0 },
      { type: 'IN', itemId, toLocId: locA, qty: -5 },
      { type: 'IN', itemId, toLocId: locA, qty: 1.5 },
      { type: 'SHRINKAGE', itemId, toLocId: locA, qty: 1 },
    ];
    for (const body of bad) {
      await request(ctx.app.getHttpServer()).post('/api/movements').set(auth()).send(body).expect(400);
    }
  });

  it('never lets concurrent issues drive a balance negative', async () => {
    // Reset to a known 100 on hand at A.
    const current = await qtyAt(locA);
    if (current < 100) {
      await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
        .send({ type: 'IN', itemId, toLocId: locA, qty: 100 - current }).expect(201);
    } else if (current > 100) {
      await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
        .send({ type: 'OUT', itemId, fromLocId: locA, qty: current - 100 }).expect(201);
    }

    // 30 simultaneous issues of 10 against 100 on hand. The conditional
    // decrement is the only thing standing between this and a negative balance;
    // if it is ever refactored into a read-then-write, this test is the fence
    // that catches it.
    const attempts = await Promise.all(
      Array.from({ length: 30 }, () =>
        request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
          .send({ type: 'OUT', itemId, fromLocId: locA, qty: 10 })
          .then((r) => r.status),
      ),
    );

    const accepted = attempts.filter((s) => s === 201).length;
    const rejected = attempts.filter((s) => s === 400).length;
    const finalQty = await qtyAt(locA);

    expect(accepted).toBe(10);
    expect(rejected).toBe(20);
    expect(finalQty).toBe(0);
    expect(finalQty).toBeGreaterThanOrEqual(0);
  });
});
