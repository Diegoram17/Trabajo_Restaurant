# Tasks: Application Skeleton and Base Schema

BACKLOG item #1. Spec: `sdd/app-skeleton-base-schema/spec` (obs 37). Design: `sdd/app-skeleton-base-schema/design` (obs 38).
ADR-0038 (Vitest), ADR-0039 (money `integer` céntimos, percentages integer basis points), ADR-0041 (dev listens
cleartext on `127.0.0.1` only) already resolve the design's D1–D3. **D-E, the data-access layer, is still open —
see Phase 0.** Strict TDD: every RED task precedes its GREEN task; nothing writes production code without a
preceding failing test.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,150–1,350 (additions), across 6 work units — a from-scratch repo bootstrap: package manifests, build config, migration runner + schema file, HTTP pipeline, 4 route shells, tRPC wiring, and 3 test tiers (unit/integration/route-rendering) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user must choose stacked-to-main or feature-branch-chain |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|------------------|--------------------|
| 1 | Repo installs, builds, `npm test` exists | PR 1 | N/A — defines `npm test` itself, no tests exist yet | N/A | Delete `package.json`/`tsconfig*`/`vite.config.ts`/`.gitignore`; nothing downstream depends on it yet |
| 2 | Unit layer: env, origin-guard, static containment, migration ordering | PR 2 | `npm test -- tests/unit` | N/A — no DB, no socket by design | Remove `src/server/config`, `src/server/http`, ordering logic in `scripts/migrate.ts`, `tests/unit/*` |
| 3 | DB schema + migration runner | PR 3 | `npm test -- tests/integration/migrations.test.ts` | Real PostgreSQL via `tests/setup/global-setup.ts` (ADR-0038) | Drop `migrations/0001_configuracion.sql`, `src/server/db/pool.ts`, execution half of `scripts/migrate.ts` — 3 tables never created |
| 4 | HTTP pipeline + SPA route shells | PR 4 | `npm test -- tests/integration/http-pipeline.test.ts tests/integration/routes.test.ts` | Real server, ephemeral port | Remove `src/server/index.ts` pipeline and `src/client/{main.tsx,routes.tsx,pages}` — Unit 3 stands alone |
| 5 | tRPC wiring + Origin proof + transport proof | PR 5 | `npm test -- tests/integration/trpc.test.ts tests/integration/transport.test.ts` | Real server, real TCP connect attempt | Remove `src/server/trpc/*`, `src/client/trpc.ts`, throwaway mutation, listener-binding change — Unit 4's static pipeline still serves |
| 6 | Docs + `TECH-DESIGN.md` propagation | PR 6 | N/A — docs | Manual fresh-clone run (task 6.2) | Revert doc lines and checkbox additions independently of code |

## Phase 0 — Decision Gate (blocking, no implementation)

- [ ] 0.1 **STOP for user decision** — data-access layer convention for future domain queries: raw `pg` query
  strings, a query builder (e.g. Kysely), or an ORM (e.g. Drizzle/Prisma). Item #7's `SELECT … FOR UPDATE`
  (ADR-0003/0007) makes this load-bearing. This task decides nothing.
  Note: item #1 writes no domain query. `scripts/migrate.ts` and `src/server/db/pool.ts` (Phase 3) inevitably
  use the `pg` driver directly to execute raw `.sql` files and hold a pool — an unavoidable low-level necessity,
  not the deferred choice. 0.1 does not block any task below.

## Phase 1 — Repository & Build Tooling (parallel-safe, scaffolding only — no tests)

- [x] 1.1 (P) `package.json`: deps (typescript, vite, react, react-dom, react-router, @trpc/server, @trpc/client,
  @trpc/react-query, @tanstack/react-query, zod, pg, vitest); scripts `build`, `dev`, `migrate`, `test` → `vitest run`
- [x] 1.2 (P) `tsconfig.json` (+ server/client split if needed), strict mode on
- [x] 1.3 (P) `.gitignore`: `node_modules`, `dist`, `build`, `.env`
- [x] 1.4 `vite.config.ts`: SPA build root + `test` block (`pool: 'forks'`, `globalSetup: tests/setup/global-setup.ts`)
- [x] 1.5 `tests/setup/global-setup.ts`: migrates a scratch PostgreSQL DB before the suite runs (ADR-0038)

## Phase 2 — Unit Layer (no DB, no socket) — TDD — DONE

- [x] 2.1 [RED] `tests/unit/env.test.ts` — loader throws at boot when `APP_ORIGIN` is unset
- [x] 2.2 [GREEN] `src/server/config/env.ts` — reads `APP_ORIGIN`, throws if missing, no default origin
- [x] 2.3 [RED] `tests/unit/origin-guard.test.ts` — matching / foreign / absent / suffix-lookalike origin cases
- [x] 2.4 [GREEN] `src/server/http/origin-guard.ts` — exact string equality vs `APP_ORIGIN`, state-changing
  methods only, 403 with no body detail
- [x] 2.5 [RED] `tests/unit/static.test.ts` — a path-traversal attempt is rejected, contained to build root
- [x] 2.6 [GREEN] `src/server/http/static.ts` — resolves against build root, rejects escapes
- [x] 2.7 [RED] `tests/unit/migrate-ordering.test.ts` — `NNNN_name.sql` files sort lexicographically; an
  already-recorded filename is skipped (mock file list + mock applied set, no real DB)
- [x] 2.8 [GREEN] `scripts/migrate.ts` — ordering/skip logic only (DB execution added in Phase 3)

**Note (discovered during apply)**: the "Focused test command" cell for Unit 2 in the Suggested Work Units
table above (`npm test -- tests/unit`) does not actually skip `tests/setup/global-setup.ts` — Vitest's
`globalSetup` runs once for the whole invocation regardless of which files the path filter selects, so that
exact command still throws on `TEST_DATABASE_URL is not set` with no PostgreSQL reachable (reproduced; see
apply-progress). This batch added `vitest.unit.config.ts` (no `globalSetup`, `include:
['tests/unit/**/*.test.ts']`) and an `npm run test:unit` script as the real focused command for this unit;
`vite.config.ts` / plain `npm test` is unchanged and remains correct for Phase 3+ once PostgreSQL is
reachable.

## Phase 3 — Database Schema (integration, real PostgreSQL) — TDD — DONE

- [x] 3.1 [RED] `tests/integration/migrations.test.ts` against real PG: (a) clean DB → 3 tables, 0 rows each;
  (b) re-run is a no-op, no error, no schema change; (c) a fractional value into a money column is rejected as a
  type mismatch; (d) `vigente_desde`/`creada_en` are `timestamptz`; (e) no `CHECK`/trigger on `vigente_desde`;
  (f) null `creada_por` rejected by `NOT NULL`; (g) no value-bearing column carries a `DEFAULT`
- [x] 3.2 [GREEN] `src/server/db/pool.ts` — `pg` `Pool` reading connection config from env
- [x] 3.3 [GREEN] `scripts/migrate.ts` — per-file transaction, `schema_migrations(nombre text PRIMARY KEY,
  aplicada_en timestamptz NOT NULL DEFAULT now())` bookkeeping
- [x] 3.4 [GREEN] `migrations/0001_configuracion.sql` — `configuracion_costos` (money cols `integer` céntimos per
  ADR-0039; pct cols `integer` basis points; `vigente_desde timestamptz NOT NULL` no CHECK; `creada_por integer
  NOT NULL` no FK; `UNIQUE (vigente_desde)`); `calendario_apertura` (7 boolean days, same `vigente_desde`/
  `creada_por` shape, `UNIQUE (vigente_desde)`); `calendario_apertura_excepcion` (`calendario_id`, `fecha date`,
  `abierto`, composite PK); `configuracion_operativa` (`fila_unica boolean PK DEFAULT true CHECK (fila_unica)`,
  `umbral_demora_min`, `inactividad_sesion_min`, no `vigente_desde` — unversioned). Zero rows inserted, no other
  `DEFAULT` on any parameter.
- [x] 3.5 Run 3.1 against 3.2–3.4, confirm GREEN

**Note (discovered during apply)**: nothing loaded `.env` before this batch (flagged as a known gap in Unit 2's
apply-progress). Fixed by adding `loadDotEnv()` to `src/server/config/env.ts` — a thin wrapper around Node's
native `process.loadEnvFile()` (stable on the Node 24 in use; guarded with `?.()` for older Node >=20 and a
try/catch swallowing only `ENOENT`), called from `tests/setup/global-setup.ts` and from `scripts/migrate.ts`'s
CLI entry point. Chosen over `node --env-file=.env` on the npm script command line because `npm test` invokes
the `vitest` binary directly (not `node`), so a CLI flag has nowhere to attach without a fragile
`node --env-file=.env node_modules/.bin/vitest` rewrite; the programmatic call works identically for
`npm test`, `npm run test:unit` (no DB, unaffected), and `npm run migrate`, and never overwrites an
already-set variable (global-setup's explicit `DATABASE_URL` override for its `npm run migrate` subprocess
still wins). Verified end-to-end: `npm test` → global-setup's subprocess prints
`Applied 1 migration(s): 0001_configuracion.sql` (first run) / `No pending migrations.` (subsequent run),
confirming `TEST_DATABASE_URL` reached the subprocess without any hardcoded path.

## Phase 4 — HTTP Pipeline & SPA Wiring — TDD

- [ ] 4.1 [RED] `tests/integration/http-pipeline.test.ts` — real server, ephemeral port: unknown path with
  `Accept: text/html` → `index.html`; `/trpc/nope` → JSON not HTML; missing hashed asset → 404 not HTML
- [ ] 4.2 [GREEN] `src/server/index.ts` — pipeline order: origin guard → `/trpc/*` → static → `Accept: text/html`
  fallback → 404
- [ ] 4.3 [RED] `tests/integration/routes.test.ts` — `/estacion`, `/kds`, `/cocina`, `/admin` each return the SPA
  entry document, 200
- [ ] 4.4 [GREEN] (P) `src/client/main.tsx`, `src/client/routes.tsx` (React Router, exactly 4 routes),
  `src/client/pages/{Estacion,Kds,Cocina,Admin}.tsx` placeholders

## Phase 5 — tRPC & Transport Proofs — TDD

- [ ] 5.1 [RED] `tests/integration/trpc.test.ts` — SPA-side typed client calls one real procedure, response type
  is server-inferred, no manually duplicated types
- [ ] 5.2 [GREEN] `src/server/trpc/{context,router,app-router}.ts` (one real query procedure) + `src/client/trpc.ts`
- [ ] 5.3 [RED] same file — throwaway mutation: matching `Origin` accepted; foreign `Origin` rejected before any
  side effect; absent `Origin` on a state-changing request rejected
- [ ] 5.4 [GREEN] add the throwaway mutation to `app-router.ts`, guarded by 2.4's origin-guard at the HTTP layer
- [ ] 5.5 [RED] `tests/integration/transport.test.ts` — server binds `127.0.0.1` only: `ECONNREFUSED` connecting
  a non-loopback local IPv4 on the same port
- [ ] 5.6 [RED] same file — request carrying `X-Forwarded-Proto: http` → 4xx, never 3xx, no `Location` header
- [ ] 5.7 [GREEN] `src/server/index.ts` / `env.ts` — bind listener to `127.0.0.1` (ADR-0041); reject on
  forwarded-proto mismatch without redirecting

## Phase 6 — Fresh-Clone Verification & Docs

- [x] 6.1 Document install/migrate/start commands (README or `package.json` scripts only) so a fresh clone with a
  reachable PostgreSQL reaches the running state with no Render/Neon account
- [x] 6.2 Manually run the documented sequence once end-to-end; record the result in the PR description
  (functional coverage already proven by 3.5, 4.3, 5.1)

**Note (discovered during apply)**: `.env.example` could NOT be created — the tool permission layer denies
writes to any `.env*` path outright (not just `.env` itself), independent of the `.gitignore` exemption
(`!.env.example`) already in place for it. Not worked around. All four environment variables
(`APP_ORIGIN`, `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`) are documented instead in `README.md` §
"Variables de entorno", with a placeholder connection-string shape shown inline in prose (no real
credential anywhere). `README.md` (new) and a new `start` script in `package.json`
(`node dist/server/index.js` — the previously-undocumented "how do I run the built server" gap) were both
required to complete 6.1; `package.json`'s `dev`/`build`/`migrate`/`test`/`test:unit`/`typecheck` scripts
were already sufficient and untouched.

## Phase 7 — TECH-DESIGN.md Propagation (orchestrator-owned, not a sub-agent task)

- [ ] 7.1 Orchestrator writes every acceptance criterion from `sdd/app-skeleton-base-schema/spec` (both
  `app-skeleton` and `base-schema` domains) into `TECH-DESIGN.md` as Spanish `- [ ]` checkboxes before archive.
  Sub-agents do not have write access to `TECH-DESIGN.md`; a change that ships without this is not done.
