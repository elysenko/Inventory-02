# StockRoom

Warehouse inventory management: an item catalog with per-location stock levels,
atomic stock movements (IN / OUT / TRANSFER) that can never drive a balance
negative, a low-stock report, and a filterable movement audit log.

- **Backend** — NestJS 11 + Prisma 6 (PostgreSQL), REST under `/api`, JWT auth.
- **Frontend** — Angular standalone components + signals, served by nginx.

## Running the backend locally

```bash
cp .env.example backend/.env      # then set DATABASE_URL and JWT_SECRET
cd backend
npm install
npx prisma migrate deploy         # apply the schema
node prisma/seed/seed.js          # demo users, locations, items, opening stock
npm run start:dev                 # http://localhost:3000/api
```

Swagger UI is at `http://localhost:3000/api/docs`.

### Demo accounts

| Email | Password | Role |
|---|---|---|
| `manager@demo` | `Demo1234!` | ADMIN (manager-level + admin settings) |
| `clerk@demo` | `Demo1234!` | CLERK |

Signup is open; the first account ever created becomes an admin and every later
signup is a clerk. The demo credentials are deliberately weak — close public
signup and reseed before any non-demo exposure.

## API

All routes are prefixed `/api`. Every endpoint requires a bearer token except
`/api/health`, `/api/health/deep`, `/api/auth/login` and `/api/auth/signup`.

| Method + path | Access | Purpose |
|---|---|---|
| `GET /api/health`, `/api/health/deep` | public | liveness / database readiness |
| `POST /api/auth/signup`, `/api/auth/login` | public | returns `{ token, user }` |
| `GET /api/auth/me` | authed | current user |
| `GET /api/items` | authed | catalog with computed `totalQty` |
| `GET /api/items/:id` | authed | item + per-location `stockLevels[]` |
| `POST/PATCH/DELETE /api/items/:id` | manager | manage the catalog |
| `GET /api/locations` | authed | locations with occupancy |
| `POST/PATCH/DELETE /api/locations/:id` | manager | manage locations |
| `GET /api/stock-levels` | authed | flat (item, location, qty) list |
| `POST /api/movements` | authed | record a movement, atomically |
| `GET /api/movements` | manager | audit log — `itemId`, `type`, `from`, `to`, `page` |
| `GET /api/reports/low-stock` | manager | items where `totalQty <= reorderAt` |
| `GET/PATCH /api/admin/settings` | admin | runtime service credentials |

## Tests

```bash
cd backend
npm run test:e2e     # requires DATABASE_URL pointing at a reachable database
```

The suite covers the role matrix, duplicate-SKU rejection, the IN/OUT/TRANSFER
balance arithmetic, the low-stock predicate, log filtering, and a concurrency
fence that fires 30 simultaneous issues against 100 units on hand and asserts
exactly 10 succeed with the balance never going negative.
