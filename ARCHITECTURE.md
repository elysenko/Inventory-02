# Architecture

## Requested stack
- `enterprise` — Angular 19 (standalone/signals) + NestJS 11 + tRPC + Prisma 6 (PostgreSQL)

## Status
- **enterprise**: ✅ newly scaffolded from `scaffold-templates/template-enterprise` (project directory was empty except `README.md` and `.github/workflows/colossus-deploy.yml` before this run)

## Layout
- `backend/` — NestJS 11 API, Prisma 6 ORM, tRPC routers (`src/<feature>/<feature>.router.ts`), health checks at `/health`. `prisma/schema.prisma` currently ships only the template's placeholder `User` model — replace with the StockRoom domain model (`User`, `Item`, `Location`, `StockLevel`, `Movement`) per the build plan.
- `frontend/` — Angular 19 standalone/signals SPA, tRPC client wired via `TRPC_CLIENT` injection token in `app.config.ts`. Currently ships only the template's placeholder `app-home` component listing users — replace with the StockRoom shell/routes/features per the build plan.
- `docker-compose.yml` — local Postgres 16 + pgAdmin only; no backend/frontend services defined yet (add per plan's Step 1 if local full-stack compose is required).
- `.pipeline/surface.json` — machine-readable contract of routes/components/testIds, regenerated from the template's actual source files (not left as template placeholder).
- `.colossus-acceptance.json` — post-deploy render-gate contract; `ready_testid` is `app-ready` (already present on `app-root`), `reject_signatures` seeded to the template's stub "Users" list markers, `expect_text` intentionally left empty for the coder to fill with real StockRoom front-page content.
- `colossus.yaml` — build manifest for deploy agents: Angular project `frontend`, output `dist/frontend/browser`, backend on port 3001.

## Next steps for the developer / build agent
1. Read `ATLAS_STACK.md` before writing code — do not change ORM (Prisma 6), framework (NestJS/Angular), or the tRPC internal API pattern.
2. Replace `backend/prisma/schema.prisma` with the StockRoom domain model (Step 2 of the plan), run `npx prisma migrate dev` to generate the initial migration (requires a running Postgres — not run by the scaffolder).
3. Implement auth (`backend/src/auth/*`), items/locations/movements/reports modules, and register `JwtAuthGuard`/`RolesGuard` globally, per the plan's Step 4 onward.
4. Build out the Angular shell, routes, guards, and feature components per the plan's Step 10 onward.
5. Update `.pipeline/surface.json` and `.colossus-acceptance.json` `expect_text` once the real StockRoom routes/components/testIds exist.
6. Copy `backend/.env.template` → `backend/.env` (and root `.env.template` → `.env` if added) and fill in `DATABASE_URL` / `JWT_SECRET` / `PORT` — no env template ships with this copy of the template, so these must be created per the plan's Step 1.
7. Run `docker compose up` locally once backend/frontend services are added to `docker-compose.yml`, and verify `/` renders "StockRoom" per the smoke oracle.

## Template source
- `template-enterprise` from `/app/scaffold-templates`
