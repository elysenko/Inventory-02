'use strict';
/**
 * Production seed — runs with plain `node`, no TypeScript toolchain needed.
 * Uses @prisma/client (generated into node_modules at build time via `npx prisma generate`).
 *
 * Usage:  node prisma/seed/seed.js
 * Called by: npx prisma db seed  (via package.json "prisma.seed" field)
 *
 * NOTE: This base seed creates users without passwords (base schema has no password column).
 * When the coder adds password-based auth, this file MUST be updated to upsert password hashes.
 * See coder.md constraints: "Seed script must be production-runnable."
 */
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

const prisma = new PrismaClient();

function derivePassword(email) {
  return createHash('sha256')
    .update(email + (process.env.SEED_SECRET || 'colossus-seed'))
    .digest('hex')
    .slice(0, 16);
}

const SEED_USERS = [
  { email: 'admin@example.com', name: 'Admin User',   role: 'ADMIN' },
  { email: 'user@example.com',  name: 'Regular User', role: 'USER'  },
];

async function main() {
  for (const u of SEED_USERS) {
    const password = derivePassword(u.email);
    await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role },
    });
    console.log(`SEED_CRED ${u.role} ${u.email} ${password}`);
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
