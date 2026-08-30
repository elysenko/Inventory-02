# Pipeline Task Decomposition

## Summary
StockRoom is a warehouse inventory system: a NestJS 11 + Prisma 6 (Postgres) REST API under the `/api` prefix and an Angular standalone/signals frontend. Authenticated users manage an item catalog (SKU, name, unit, reorder point) and storage locations, record atomic stock movements (`IN`, `OUT`, `TRANSFER`) that can never drive a balance negative, and — at manager/admin level — read a filterable, paginated movement audit log and a low-stock report (`totalQty <= reorderAt`). Auth is JWT (HS256, 24h, bearer token in `localStorage`); every data endpoint is protected by a globally registered guard, with `@Public()` opting out only login, signup and health. An `/admin/settings` page exposes runtime credentials for the provisioned backing services (postgresql, minio).

## Surface contract

### Backend routes (all prefixed `/api`)
| Method + path | Access | Behaviour |
|---|---|---|
| `GET /api/health` | public | liveness |
| `GET /api/health/deep` | public | `SELECT 1` against Postgres |
| `POST /api/auth/signup` | public | create user; first-ever user → manager-level role, later signups → clerk |
| `POST /api/auth/login` | public | returns `{ token, user: { id, email, role } }` |
| `GET /api/auth/me` | authed | current user |
| `GET /api/items` | authed | items with computed `totalQty` |
| `GET /api/items/:id` | authed | item + `stockLevels[]` per-location breakdown (sum === `totalQty`) |
| `POST /api/items` | manager | create; duplicate `sku` → 409/400, no second row written |
| `PATCH /api/items/:id` | manager | update |
| `DELETE /api/items/:id` | manager | 409 when stock or movement history exists |
| `GET /api/locations` | authed | list (populates movement form) |
| `POST /api/locations` | manager | create |
| `PATCH /api/locations/:id` | manager | update |
| `DELETE /api/locations/:id` | manager | 409 when referenced |
| `POST /api/movements` | authed (clerk or manager) | atomic balance update + audit row |
| `GET /api/movements` | manager | filters `itemId`, `type`, `from`, `to`, `page`; page size 50; `createdAt desc` |
| `GET /api/reports/low-stock` | manager | items where `totalQty <= reorderAt`, sorted by shortfall |
| `GET /api/admin/settings` | admin | service/credential keys with masked values + configured flag |
| `PATCH /api/admin/settings` | admin | upsert key/value pairs |

### Frontend routes
| Route | Guard | `data.flow` | URL state |
|---|---|---|---|
| `''` → `/items` | — | — | redirect |
| `/login` | public | `auth.login` | — |
| `/signup` | public | `auth.signup` | — |
| `/items` | auth | `items.list` | `?q=&sort=&modal=create` |
| `/items/:id` | auth | `items.detail` | `?panel=locations&modal=edit` |
| `/locations` | manager | `locations.list` | `?modal=create\|edit&id=` |
| `/movements/new` | auth | `movements.create` | `?type=IN\|OUT\|TRANSFER&itemId=` |
| `/movements` | manager | `movements.log` | `?itemId=&type=&from=&to=&page=` |
| `/reports/low-stock` | manager | `reports.lowStock` | `?sort=` |
| `/admin/settings` | admin | `admin.settings` | — |

### Entities
`User(id, email @unique, passwordHash, name?, role)`, `Item(id, sku @unique, name, description, unit, reorderAt)`, `Location(id, name, zone)`, `StockLevel(id, itemId, locationId, qty)` with `@@unique([itemId, locationId])`, `Movement(id, type, itemId, fromLocId?, toLocId?, qty, note?, userId, createdAt)`, `SystemSetting(key, value, updatedAt)`.

### Shell invariants
Header brand literal `StockRoom` renders on every view including unauthenticated `/login`; `index.html` `<title>StockRoom</title>`; nginx serves `dist/stockroom/browser` with `try_files $uri $uri/ /index.html` and proxies `/api` to `backend:3000`.

## db_agent tasks
- [ ] Replace the scaffolded `User` model in `backend/prisma/schema.prisma`: keep `id`, `email @unique`, `name String?`, `createdAt`, `updatedAt`; add `passwordHash String`; declare `enum UserRole { ADMIN MANAGER CLERK USER }` and `role UserRole @default(USER)`.
- [ ] Add `Item(id, sku String @unique, name String, description String?, unit String, reorderAt Int)` to `schema.prisma`.
- [ ] Add `Location(id, name String, zone String)` to `schema.prisma`.
- [ ] Add `StockLevel(id, itemId, locationId, qty Int @default(0))` with relations to `Item`/`Location` and `@@unique([itemId, locationId])` (required for the atomic upsert/conditional-update path).
- [ ] Add `enum MovementType { IN OUT TRANSFER }` and `Movement(id, type, itemId, fromLocId String?, toLocId String?, qty Int, note String?, userId, createdAt @default(now()))` with relations plus `@@index([itemId])` and `@@index([createdAt])` for log filtering.
- [ ] Add `SystemSetting` model — `key String @id`, `value String`, `updatedAt DateTime @updatedAt` — backing runtime credential storage for postgresql and minio.
- [ ] Pin `prisma` and `@prisma/client` to `^6` in `backend/package.json` (scaffold currently pins `^7`), keep `generator client { provider = "prisma-client-js" }`, and commit the regenerated lockfile.
- [ ] Generate the initial migration under `backend/prisma/migrations/` against an empty database and verify `npx prisma migrate deploy` succeeds from scratch.
- [ ] Rewrite `backend/prisma/seed.ts` as idempotent upserts: `manager@demo` (manager-level) and `clerk@demo` (clerk), password `Demo1234!` bcrypt-hashed; locations `Zone A`, `Zone B`, `Zone C`; 8 items with varied `reorderAt`; opening stock applied as `IN` movements so `StockLevel` and `Movement` stay consistent, tuned so low-stock and multi-location breakdowns are non-empty on first load. Point the `prisma.seed` package.json hook at this file.

## backend_agent tasks
- [ ] Delete the scaffolded tRPC layer (`backend/src/trpc/`, `backend/src/users/users.router.ts`, `@trpc/server`/`nestjs-trpc` deps) and rewire `backend/src/app.module.ts` to the REST modules: prisma, auth, items, locations, movements, reports, admin-settings, health.
- [ ] Configure `backend/src/main.ts` — `setGlobalPrefix('api')`, `ValidationPipe({ whitelist: true, transform: true })`, CORS for the frontend origin, listen on `PORT`.
- [ ] Keep `PrismaService extends PrismaClient implements OnModuleInit`; implement `GET /api/health` and `GET /api/health/deep` (`SELECT 1`) marked `@Public()`.
- [ ] Build `backend/src/auth/` — `auth.module.ts`, `auth.service.ts`, `auth.controller.ts` (`POST /api/auth/signup`, `POST /api/auth/login` both `@Public()`, `GET /api/auth/me`), `jwt.strategy.ts` attaching `{ userId, email, role }`, `dto/login.dto.ts`, `dto/signup.dto.ts`, bcrypt cost 10, HS256 24h tokens from `JWT_SECRET`.
- [ ] Build `backend/src/auth/` guards + decorators — `jwt-auth.guard.ts` and `roles.guard.ts` registered as `APP_GUARD` (unauthenticated calls to any data endpoint return 401 by default), `public.decorator.ts`, `roles.decorator.ts`, `current-user.decorator.ts`. Manager-level checks must accept both `ADMIN` and `MANAGER`; `@Roles('ADMIN')` gates the `/api/admin/*` group only.
- [ ] Signup role assignment: first registered user gets manager-level role (`ADMIN`), every later signup gets `CLERK`; seed runs first so demo signups are clerks.
- [ ] Build `backend/src/items/` — `GET /api/items` (any authed) returning each item with summed `totalQty`; `GET /api/items/:id` returning the item plus `stockLevels[]` per location.
- [ ] Add manager-only `POST`/`PATCH`/`DELETE /api/items/:id` with `create-item.dto.ts`/`update-item.dto.ts`; map Prisma `P2002` on `sku` to a 409/400 validation error with no second row written; `DELETE` returns 409 when stock or movement history references the item.
- [ ] Build `backend/src/locations/` — `GET /api/locations` for any authed user; manager-only create/update/delete with DTO validation and 409 on delete when `StockLevel` or `Movement` rows reference the location.
- [ ] Implement `POST /api/movements` in `backend/src/movements/movements.service.ts` inside `prisma.$transaction`: validate the type/location combination (`IN`→`toLocId`, `OUT`→`fromLocId`, `TRANSFER`→both and distinct, `qty` positive int); debit via conditional `updateMany({ where: { itemId, locationId: fromLocId, qty: { gte: qty } }, data: { qty: { decrement: qty } } })` and throw `BadRequestException('insufficient stock')` when `count === 0`; credit via `upsert` on `(itemId, locationId)` with `increment`; create the `Movement` row in the same transaction; retry once on `P2002` from a concurrent first-time upsert.
- [ ] Implement `GET /api/movements` (manager-only) with `query-movements.dto.ts` supporting `itemId`, `type`, `from`, `to`, `page` (default page size 50), including user/item/from-location/to-location relations, ordered `createdAt desc`, returning total count for pagination.
- [ ] Build `backend/src/reports/` — `GET /api/reports/low-stock` `@Roles` manager-level, aggregating stock per item and returning items where `totalQty <= reorderAt`, sorted by shortfall (`reorderAt - totalQty` desc).
- [ ] Create `backend/src/lib/config.ts` exporting `resolveConfig(key: string): Promise<string | null>` — read `process.env[key]` first, fall back to the `SystemSetting` row when the env value is absent or equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, return `null` when neither is set.
- [ ] Build the admin settings module — `GET /api/admin/settings` listing the postgresql and minio credential keys with masked values and a `configured` flag, and `PATCH /api/admin/settings` upserting key/value pairs into `SystemSetting`; both require the `ADMIN` role.
- [ ] Update `backend/Dockerfile` to `node:22-slim` multi-stage (deps → `prisma generate` → `nest build` → runtime copying `dist/`, `node_modules`, `prisma/`) with an entrypoint running `prisma migrate deploy && node dist/main.js`; align `backend/package.json` deps with the spec (`@nestjs/passport`, `passport-jwt`, `bcrypt`, `class-validator`, `class-transformer`, jest/supertest).

## ui_agent tasks
- [ ] Set `frontend/src/index.html` `<title>StockRoom</title>`, author `src/styles.scss`, and align `frontend/package.json`/`angular.json` with the spec (`@angular/*@^22`, project name `stockroom` so the build output is `dist/stockroom/browser`).
- [ ] Build the shell `src/app/app.ts` / `app.html` — literal `StockRoom` brand rendered on every view including unauthenticated ones and never behind an async spinner, role-aware nav (locations/movement log/low-stock for managers, `/admin/settings` for admins), logout action.
- [ ] Author `src/app/app.routes.ts` with every route and `data.flow` value from the surface contract, plus `''` → `/items` redirect, and `src/app/app.config.ts` registering router + HTTP providers and the auth interceptor.
- [ ] Build `src/app/features/auth/login.component.ts` and `signup.component.ts` — reactive forms, inline field and server-error rendering, brand visible, redirect to `/items` on success.
- [ ] Build `src/app/features/items/item-list.component.ts` — table of sku/name/unit/reorderAt/totalQty, `?q=` search and `?sort=` bound to query params, `?modal=create` opening the create form, empty/loading/error states.
- [ ] Build `src/app/features/items/item-detail.component.ts` and `item-form.component.ts` — detail header, per-location stock table driven by `?panel=locations`, `?modal=edit` edit form, manager-only edit/delete controls with a 409-on-delete inline message.
- [ ] Build `src/app/features/locations/location-list.component.ts` and `location-form.component.ts` — list with zone, `?modal=create|edit&id=` restored on load, delete with 409 inline handling.
- [ ] Build `src/app/features/movements/movement-form.component.ts` — type selector bound to `?type=` and prefill from `?itemId=`, showing destination for `IN`, source for `OUT`, both for `TRANSFER`, and surfacing the `insufficient stock` 400 inline without clearing the form.
- [ ] Build `src/app/features/movements/movement-log.component.ts` — paginated table (item, type, from/to, qty, user, timestamp, note) with `?itemId=&type=&from=&to=&page=` filters bound to query params, empty state for no matches.
- [ ] Build `src/app/features/reports/low-stock.component.ts` — items at or below reorder point with shortfall column and `?sort=` binding, empty state when nothing is low.
- [ ] Build `src/app/features/admin/settings.component.ts` at `/admin/settings` — one section per provisioned service (postgresql, minio) with a configured/unconfigured badge and a credential form per service, saving via `PATCH /api/admin/settings`; no integration credential sections (the spec declares no integrations).
- [ ] Author `frontend/Dockerfile` (build stage `ng build`, nginx stage copying `dist/stockroom/browser`) and `frontend/nginx.conf` with `try_files $uri $uri/ /index.html` and `location /api { proxy_pass http://backend:3000; }`.

## service_agent tasks
- [ ] Replace the scaffolded tRPC client (`ngx-trpc`, `src/app/trpc-client.types.ts`) with a typed `HttpClient` data layer and define `src/app/core/models.ts` — `User`, `Role`, `Item`, `ItemDetail`, `StockLevel`, `Location`, `Movement`, `MovementType`, `MovementPage`, `LowStockRow`, `SettingRow`.
- [ ] Build `src/app/core/auth.service.ts` — signal-backed current user/token, `login`, `signup`, `me`, `logout` (client-side token discard), `localStorage` persistence and rehydration on boot.
- [ ] Build `src/app/core/auth.interceptor.ts` — attach `Authorization: Bearer <token>` to `/api` requests and redirect to `/login` on 401.
- [ ] Build `src/app/core/auth.guard.ts` and `manager.guard.ts` (plus an admin check for `/admin/settings`) returning redirects to `/login` or `/items` as appropriate.
- [ ] Build `src/app/core/items.service.ts` and `locations.service.ts` wrapping the item and location REST endpoints including error passthrough for 409 delete-restricted responses.
- [ ] Build `src/app/core/movements.service.ts` — `create(dto)` surfacing the 400 `insufficient stock` message, and `list(filters)` serialising `itemId`/`type`/`from`/`to`/`page` into query params.
- [ ] Build `src/app/core/reports.service.ts` for `GET /api/reports/low-stock` and `src/app/core/settings.service.ts` for `GET`/`PATCH /api/admin/settings`.

## tester tasks
- [ ] `backend/test/auth.e2e-spec.ts` — unauthenticated `GET /api/items` returns 401; signup then login returns a token; `GET /api/auth/me` echoes the role; clerk login can list items.
- [ ] `backend/test/items.e2e-spec.ts` — manager creates an item; clerk `POST /api/items` returns 403; duplicate `SKU-001` returns a validation error **and** the item count is unchanged; `GET /api/items/:id` per-location breakdown sums to `totalQty`; delete with history returns 409.
- [ ] `backend/test/locations.e2e-spec.ts` — any authed user can list locations; clerk mutation returns 403; delete of a referenced location returns 409.
- [ ] `backend/test/movements.e2e-spec.ts` — `IN 50` yields balance 50 plus an audit entry; `OUT 20` yields 30; `TRANSFER 10` yields A=20 / B=10 with total unchanged; `OUT 10` against 5 on hand returns 400 and the stored balance is still 5; invalid type/location combinations are rejected.
- [ ] `backend/test/movements-concurrency.e2e-spec.ts` — fire parallel `OUT` requests that together exceed stock; assert exactly one succeeds and the balance never goes negative (regression fence for the conditional-`updateMany` guard).
- [ ] `backend/test/movements-log.e2e-spec.ts` — log is manager-only (clerk → 403); filtering by `itemId` and by `from`/`to` date range returns only matches; pagination defaults to 50 and `createdAt desc` ordering holds.
- [ ] `backend/test/reports.e2e-spec.ts` — item with `reorderAt` 10 and 12 on hand appears in low-stock after an `OUT 5`; item with 40 on hand is absent; endpoint returns 403 for a clerk.
- [ ] `backend/test/admin-settings.e2e-spec.ts` — `GET /api/admin/settings` lists postgresql and minio keys with masked values and configured flags; `PATCH` upserts and is reflected by `resolveConfig`; non-admin roles get 403.
- [ ] Frontend deep-link checks — every route in the surface contract loads directly by URL with restored `?modal=`/`?panel=`/filter state, unauthenticated hits redirect to `/login`, and manager-only routes reject a clerk token.
- [ ] Smoke test — `docker compose up`, load `/`, assert the literal `StockRoom` is present in the rendered DOM in the unauthenticated state.

## Open questions
- **Stack version drift vs the scaffold.** The scaffold ships Prisma `^7`, Angular `^19`, `bcryptjs`, and a tRPC transport; the spec pins Prisma `^6`, Angular `^22`, `bcrypt`, and plain REST. Tasks above follow the spec (spec is source of truth) and remove the tRPC layer — confirm the Angular 22 pin is available in the toolchain before ui_agent starts, and fall back to the scaffolded Angular major only if 22 cannot be resolved.
- **Role vocabulary.** The pipeline auth model supplies roles `admin`/`user` while the spec uses `manager`/`clerk`. Tasks declare `enum UserRole { ADMIN MANAGER CLERK USER }` and treat `ADMIN` as the manager superset (first signup → `ADMIN`, later signups → `CLERK`). Confirm whether a distinct `MANAGER` role is ever assigned, or whether it should be dropped as unused.
- **minio is provisioned but unused.** The spec declares no file/object storage feature and no integrations. The admin settings page and `resolveConfig` still expose its credential keys; confirm whether any feature is expected to consume minio, otherwise it stays configuration-only.
- **`/admin/settings` vs manager routes.** The spec's route table has no admin section; the settings page is added per pipeline rules. Confirm the nav placement and whether managers (non-admin) should see it.
- **Movement edits/reversals.** The spec defines create + read for movements only. Correcting a mis-keyed movement has no defined path — confirm whether a compensating movement is the intended workflow.
- **Item `description` and `unit` validation.** The spec lists both fields but no constraints (required vs optional, allowed units). Tasks treat `description` as optional and `unit` as a required free-text string.
