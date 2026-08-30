'use strict';
/**
 * StockRoom production seed. Runs with plain `node` — no TypeScript toolchain.
 *
 *   node prisma/seed/seed.js      (also wired to `npx prisma db seed`)
 *
 * Idempotent: users, items and locations are upserted by their natural keys, and
 * opening stock is applied only for items that have no movement history yet, so
 * re-running never double-counts a balance.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Demo1234!';

const USERS = [
  { email: 'manager@demo', name: 'Dana Reyes', role: 'ADMIN' },
  { email: 'clerk@demo', name: 'Sam Okafor', role: 'CLERK' },
];

const LOCATIONS = [
  { name: 'Zone A', zone: 'Main Warehouse' },
  { name: 'Zone B', zone: 'Main Warehouse' },
  { name: 'Zone C', zone: 'Cold Store' },
];

// `opening` is keyed by location name. Quantities are tuned so the low-stock
// report and the multi-location breakdown are both non-empty on first load.
const ITEMS = [
  { sku: 'SKU-001', name: 'M6 Hex Bolt',        description: 'Zinc-plated, 30mm',      unit: 'ea',  reorderAt: 100, opening: { 'Zone A': 180, 'Zone B': 60 } },
  { sku: 'SKU-002', name: 'M6 Hex Nut',         description: 'Zinc-plated',            unit: 'ea',  reorderAt: 100, opening: { 'Zone A': 40,  'Zone B': 35 } },
  { sku: 'SKU-003', name: 'Packing Tape',       description: '48mm clear, 66m roll',   unit: 'roll', reorderAt: 25, opening: { 'Zone B': 12 } },
  { sku: 'SKU-004', name: 'Corrugated Box M',   description: '400x300x200mm',          unit: 'ea',  reorderAt: 50,  opening: { 'Zone A': 220, 'Zone C': 40 } },
  { sku: 'SKU-005', name: 'Bubble Wrap',        description: '500mm x 50m',            unit: 'roll', reorderAt: 10, opening: { 'Zone B': 6 } },
  { sku: 'SKU-006', name: 'Pallet Wrap',        description: '500mm stretch film',     unit: 'roll', reorderAt: 15, opening: { 'Zone A': 48 } },
  { sku: 'SKU-007', name: 'Thermal Labels',     description: '100x150mm, 500/roll',    unit: 'roll', reorderAt: 20, opening: { 'Zone A': 9, 'Zone C': 5 } },
  { sku: 'SKU-008', name: 'Safety Gloves',      description: 'Nitrile-coated, size L', unit: 'pair', reorderAt: 30, opening: { 'Zone C': 120 } },
];

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const byEmail = new Map();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    byEmail.set(u.email, user);
    console.log(`SEED_CRED ${u.role} ${u.email} ${DEMO_PASSWORD}`);
  }
  return byEmail;
}

async function seedLocations() {
  const byName = new Map();
  for (const l of LOCATIONS) {
    const location = await prisma.location.upsert({
      where: { name: l.name },
      update: { zone: l.zone },
      create: l,
    });
    byName.set(l.name, location);
  }
  return byName;
}

async function seedItems() {
  const bySku = new Map();
  for (const i of ITEMS) {
    const item = await prisma.item.upsert({
      where: { sku: i.sku },
      update: { name: i.name, description: i.description, unit: i.unit, reorderAt: i.reorderAt },
      create: { sku: i.sku, name: i.name, description: i.description, unit: i.unit, reorderAt: i.reorderAt },
    });
    bySku.set(i.sku, item);
  }
  return bySku;
}

/**
 * Opening balances go in through the same shape as a real IN movement — a
 * StockLevel write and a Movement row in one transaction — so a freshly seeded
 * database has an audit log that actually explains its balances.
 */
async function seedOpeningStock(items, locations, userId) {
  let applied = 0;
  for (const spec of ITEMS) {
    const item = items.get(spec.sku);
    const existing = await prisma.movement.count({ where: { itemId: item.id } });
    if (existing > 0) continue; // already opened — never double-count

    for (const [locationName, qty] of Object.entries(spec.opening)) {
      const location = locations.get(locationName);
      await prisma.$transaction(async (tx) => {
        await tx.stockLevel.upsert({
          where: { itemId_locationId: { itemId: item.id, locationId: location.id } },
          create: { itemId: item.id, locationId: location.id, qty },
          update: { qty: { increment: qty } },
        });
        await tx.movement.create({
          data: {
            type: 'IN',
            itemId: item.id,
            toLocId: location.id,
            qty,
            note: 'Opening balance',
            userId,
          },
        });
      });
      applied += 1;
    }
  }
  return applied;
}

async function main() {
  const users = await seedUsers();
  const locations = await seedLocations();
  const items = await seedItems();
  const openingBy = users.get('manager@demo');
  const applied = await seedOpeningStock(items, locations, openingBy.id);

  console.log(
    `Seed complete: ${users.size} users, ${locations.size} locations, ${items.size} items, ` +
      `${applied} opening-stock movement(s) applied.`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
