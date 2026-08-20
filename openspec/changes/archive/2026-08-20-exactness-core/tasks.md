# Tasks: Exactness core

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900-1000 (additions+deletions, authored; generated `schema.d.ts` excluded) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (rounding) → PR 2 (operational day/trigger) → PR 3 (data access, consumes PR 2) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (user-approved 2026-08-20) — PR 1 and PR 2 are mutually independent; PR 3 depends only on PR 2 |

Decision needed before apply: Resolved — stacked-to-main, user-approved 2026-08-20
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Rounding domain (`redondear`/`porcentaje`/`reparto`), pure, no DB | PR 1 | `npm run test:unit` | N/A — pure functions, no real scenario needed | Revert `src/server/domain/redondeo.ts` + its tests + the TECH-DESIGN checkbox; nothing else depends on it |
| 2 | `dia_operativo()` + `vigente_desde_no_retroactiva` trigger | PR 2 | `npx vitest run tests/integration/dia-operativo.test.ts tests/integration/vigencia.test.ts` | Real PostgreSQL (ADR-0038), `TEST_DATABASE_URL` | Forward-only `migrations/0003_*.sql` dropping the 2 triggers + 2 functions |
| 3 | Kysely wiring, `vigencias.ts`, schema-types gate, ADR-0042, TECH-DESIGN docs | PR 3 | `npm test` | Real PostgreSQL, `db:types` against `TEST_DATABASE_URL` | Revert `context.ts`/`index.ts` to `pool.query`, drop `kysely*` deps; no schema object depends on it |

## Phase 1: Rounding domain (PR 1, pure)

- [x] 1.1 RED `tests/unit/redondeo.test.ts`: `redondear` — 0.5/-0.5 half-up-symmetric, sub-cent (180g/1200g/S/50 → 750), `BigInt(1.5)` throws, safe-integer overflow throws
- [x] 1.2 GREEN `src/server/domain/redondeo.ts`: `redondear(numerador: bigint, denominador: bigint)` (D2-C, D2-D)
- [x] 1.3 RED same file: `porcentaje` — single rounding via `redondear(base*puntos,10000n)`; sum-of-rows vs aggregate-recalc test
- [x] 1.4 GREEN `redondeo.ts`: `porcentaje(base, puntos)`
- [x] 1.5 RED same file: `reparto` — Σparts=total property test; combo order (peso desc/clave asc); fixed-cost order (clave asc); non-total comparator throws; empty/zero-weight/negative-total throw
- [x] 1.6 GREEN `redondeo.ts`: `reparto<T>(total, partes, {ordenResiduo})` (D2-E)
- [x] 1.7 RED `tests/unit/sin-redondeo-suelto.test.ts`: zero occurrences of `Math.*`/`toFixed`/`parseFloat` under `src/server/**`
- [x] 1.8 Confirm 1.7 passes against current tree (no production fix expected)
- [x] 1.9 `TECH-DESIGN.md` (~line 780): add new `- [ ]` checkbox propagating `redondear`'s half-up-**symmetric-around-zero** rule (D2-D) — undocumented until now

## Phase 2: Operational day & vigencia trigger (PR 2, real PostgreSQL)

- [x] 2.1 Create `migrations/0002_dia_operativo_y_vigencia.sql`: `dia_operativo()` STABLE STRICT; `vigencia_no_retroactiva()` trigger fn (raises `23514`/`vigente_desde_no_retroactiva`); triggers on `configuracion_costos` + `calendario_apertura`
- [x] 2.2 RED `tests/integration/dia-operativo.test.ts`: ADR-0028 vectors (Sat 23:40, Sun 00:30, Sun 05:00 cutoff, Sun 05:01) + gap-free partition (04:59:59 vs 05:00:00)
- [x] 2.3 GREEN: run `npm run migrate` (2.1) against `TEST_DATABASE_URL`, confirm 2.2 passes
- [x] 2.4 RED `tests/integration/vigencia.test.ts`: reject `vigente_desde` = today's operational-day start minus 1s; accept at day start; accept `UPDATE` of another column on an old row — wrapped in a per-test transaction + `ROLLBACK` (raw `pg.Client`, not `db.transaction()`: Kysely does not exist yet in PR 2, only arrives in Phase 3)
- [x] 2.5 GREEN: confirm 2.1's trigger satisfies 2.4 (no new code)
- [x] 2.6 Same file: `pg_constraint` catalog-query assertion — NO `CHECK` constraint mentions `dia_operativo` on either table (freezes P1 against a future silent trigger→CHECK "simplification")

## Phase 3: Data access layer (PR 3, consumes Phase 2)

- [x] 3.1 `package.json`: add `kysely` dep, `kysely-codegen` devDep, `db:types` script (`kysely-codegen --dialect postgres --out-file src/server/db/schema.d.ts`, no `--camel-case`)
- [x] 3.2 Generate `src/server/db/schema.d.ts` via `npm run db:types` against migrated `TEST_DATABASE_URL`; commit it
- [x] 3.3 Create `src/server/db/kysely.ts`: `createDb(pool)` wraps the existing `pg.Pool` in `Kysely<DB>`/`PostgresDialect` (D2-F)
- [x] 3.4 RED `tests/integration/vigencia.test.ts`: effective-row resolution — greatest `vigente_desde` ≤ today; empty table ⇒ `sin_vigencia`; a past `momento` returns the row that governed then
- [x] 3.5 GREEN `src/server/domain/vigencias.ts`: `Vigencia<T>` union (D2-H), `configuracionCostosVigente`/`calendarioAperturaVigente` via `sql\`dia_operativo(vigente_desde) <= dia_operativo(${instante})\``, bound param, default `now()`
- [x] 3.6 Modify `src/server/trpc/context.ts`: `Context.db` required, `createContextFactory(db)` (D2-G)
- [x] 3.7 Modify `src/server/index.ts`: `ServerConfig.db`, wire `createContextFactory(db)`, teardown `db.destroy()`
- [x] 3.8 Modify `tests/integration/{http-pipeline,trpc,routes,transport}.test.ts`: pass `db` into `createServer` (D2-G)
- [x] 3.9 RED `tests/integration/schema-types.test.ts`: regenerate schema to a temp file from `TEST_DATABASE_URL`, normalize CRLF→LF, compare vs committed `schema.d.ts`, fail naming `npm run db:types`
- [x] 3.10 GREEN: confirm 3.9 passes against 3.2's committed file
- [x] 3.11 Create `adrs/0042-capa-de-acceso-a-datos.md`: append-only ADR for Kysely + trigger-over-CHECK (P1) + codegen gate (P2)
- [x] 3.12 `TECH-DESIGN.md` decisions table (~line 99): add ADR-0042 row
- [x] 3.13 `TECH-DESIGN.md`: new "Resolución de vigencias" `- [ ]` criteria block — greatest-`vigente_desde`-≤-today algorithm, `sin_vigencia`/union case (Spanish)

## Phase 4: Verification

- [x] 4.1 `npm run test:unit` — Phase 1 green, no DB
- [x] 4.2 `npm test` — full suite green (migrations, http-pipeline, trpc, routes, transport, dia-operativo, vigencia, schema-types)
- [x] 4.3 `npm run typecheck` — bigint arithmetic and `Kysely<DB>` context compile clean

## Phase 5: Verify remediation (data-access, 2 CRITICAL findings from sdd-verify)

`sdd-verify` found the implementation itself correct (93/93 tests, direct live-PostgreSQL checks)
but flagged 2 `data-access` spec scenarios with no covering test. This phase closes both,
test-coverage only — no change to `redondeo.ts`, `vigencias.ts`, the migration, ADR-0042, or
TECH-DESIGN.md.

- [x] 5.1 `tests/unit/sin-sql-interpolado.test.ts`: structural audit (same style as
  `sin-redondeo-suelto.test.ts`) proving zero occurrences of `sql.raw()`/`pool.query()`/
  `client.query()` built with a value interpolated directly into SQL text under `src/server/**`
  — closes "No money-writing path bypasses the bound parameter". Non-vacuous: verified by
  temporarily planting a real violation under `src/server/domain/`, confirming the test caught
  it, then removing it.
- [x] 5.2 `tests/integration/row-locking.test.ts`: real-PostgreSQL integration test proving
  Kysely's typed `.forUpdate()` reaches an actual row-level `SELECT ... FOR UPDATE` lock — a
  second, independent connection requesting the same lock genuinely blocks (`SET LOCAL
  lock_timeout` + PostgreSQL's `55P03`/`lock_not_available`) until the first transaction ends —
  closes "Row locking is reachable with no escape hatch". Non-vacuous: genuine RED first
  (`.forUpdate()` temporarily removed, test failed exactly as expected), then GREEN after
  restoring it.
