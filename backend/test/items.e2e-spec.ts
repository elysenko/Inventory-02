import * as request from 'supertest';
import { Role } from '@prisma/client';
import { bootTestApp, purgeItems, purgeUsers, TestContext, uniqueSuffix } from './helpers';

describe('Item catalog', () => {
  let ctx: TestContext;
  let token: string;
  let email: string;
  const skus: string[] = [];

  beforeAll(async () => {
    ctx = await bootTestApp();
    email = `e2e-items-${uniqueSuffix()}@demo`;
    await request(ctx.app.getHttpServer())
      .post('/api/auth/signup')
      .send({ name: 'Items Manager', email, password: 'Demo1234!' })
      .expect(201);
    await ctx.prisma.user.update({ where: { email }, data: { role: Role.MANAGER } });
    const login = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Demo1234!' })
      .expect(200);
    token = login.body.token;
  });

  afterAll(async () => {
    const items = skus.length > 0 ? await ctx.prisma.item.findMany({ where: { sku: { in: skus } } }) : [];
    await purgeItems(ctx, items.map((i) => i.id));
    await purgeUsers(ctx, [email]);
    await ctx.app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('creates an item and lists it with a computed total quantity', async () => {
    const sku = `E2E-ITEM-${uniqueSuffix()}`;
    skus.push(sku);
    const created = await request(ctx.app.getHttpServer())
      .post('/api/items')
      .set(auth())
      .send({ sku, name: 'Test Widget', unit: 'ea', reorderAt: 10 })
      .expect(201);
    expect(created.body.totalQty).toBe(0);

    const list = await request(ctx.app.getHttpServer()).get('/api/items').set(auth()).expect(200);
    const found = list.body.find((i: { sku: string }) => i.sku === sku);
    expect(found).toMatchObject({ sku, name: 'Test Widget', unit: 'ea', reorderAt: 10, totalQty: 0 });
  });

  it('rejects a duplicate SKU without writing a second row', async () => {
    const sku = `E2E-DUP-${uniqueSuffix()}`;
    skus.push(sku);
    await request(ctx.app.getHttpServer()).post('/api/items').set(auth()).send({ sku, name: 'First' }).expect(201);

    const before = await ctx.prisma.item.count();
    await request(ctx.app.getHttpServer()).post('/api/items').set(auth()).send({ sku, name: 'Second' }).expect(409);
    const after = await ctx.prisma.item.count();

    // The point of the assertion is the row count, not just the status code:
    // a rejected create must leave the catalog byte-for-byte unchanged.
    expect(after).toBe(before);
    const rows = await ctx.prisma.item.findMany({ where: { sku } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('First');
  });

  it('rejects an item with no SKU or no name', async () => {
    await request(ctx.app.getHttpServer()).post('/api/items').set(auth()).send({ name: 'No SKU' }).expect(400);
    await request(ctx.app.getHttpServer()).post('/api/items').set(auth()).send({ sku: 'E2E-X' }).expect(400);
  });

  it('updates an item', async () => {
    const sku = `E2E-UPD-${uniqueSuffix()}`;
    skus.push(sku);
    const created = await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku, name: 'Before', reorderAt: 5 }).expect(201);

    const updated = await request(ctx.app.getHttpServer())
      .patch(`/api/items/${created.body.id}`).set(auth()).send({ name: 'After', reorderAt: 25 }).expect(200);

    expect(updated.body).toMatchObject({ sku, name: 'After', reorderAt: 25 });
  });

  it('returns a per-location breakdown that sums to the headline total', async () => {
    const sku = `E2E-SPLIT-${uniqueSuffix()}`;
    skus.push(sku);
    const item = await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku, name: 'Split Stock' }).expect(201);

    const locations = await request(ctx.app.getHttpServer()).get('/api/locations').set(auth()).expect(200);
    const [a, b] = locations.body;

    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'IN', itemId: item.body.id, toLocId: a.id, qty: 30 }).expect(201);
    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'IN', itemId: item.body.id, toLocId: b.id, qty: 12 }).expect(201);

    const detail = await request(ctx.app.getHttpServer()).get(`/api/items/${item.body.id}`).set(auth()).expect(200);
    const sum = detail.body.stockLevels.reduce((acc: number, s: { qty: number }) => acc + s.qty, 0);
    expect(detail.body.totalQty).toBe(42);
    expect(sum).toBe(detail.body.totalQty);
    expect(detail.body.stockLevels.every((s: { locationName: string }) => !!s.locationName)).toBe(true);
  });

  it('refuses to delete an item that carries movement history', async () => {
    const sku = `E2E-HIST-${uniqueSuffix()}`;
    skus.push(sku);
    const item = await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku, name: 'Has History' }).expect(201);
    const locations = await request(ctx.app.getHttpServer()).get('/api/locations').set(auth()).expect(200);

    await request(ctx.app.getHttpServer()).post('/api/movements').set(auth())
      .send({ type: 'IN', itemId: item.body.id, toLocId: locations.body[0].id, qty: 5 }).expect(201);

    await request(ctx.app.getHttpServer()).delete(`/api/items/${item.body.id}`).set(auth()).expect(409);
    expect(await ctx.prisma.item.count({ where: { id: item.body.id } })).toBe(1);
  });

  it('deletes an untouched item', async () => {
    const sku = `E2E-DEL-${uniqueSuffix()}`;
    const item = await request(ctx.app.getHttpServer())
      .post('/api/items').set(auth()).send({ sku, name: 'Disposable' }).expect(201);
    await request(ctx.app.getHttpServer()).delete(`/api/items/${item.body.id}`).set(auth()).expect(200);
    expect(await ctx.prisma.item.count({ where: { id: item.body.id } })).toBe(0);
  });

  it('404s for an item that does not exist', async () => {
    await request(ctx.app.getHttpServer())
      .get('/api/items/00000000-0000-4000-8000-000000000000').set(auth()).expect(404);
  });
});
