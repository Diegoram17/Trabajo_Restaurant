# Apply Progress: arranque-admin-dispositivo (BACKLOG #3)

Cumulative state across ALL apply batches. engram topic
`sdd/arranque-admin-dispositivo/apply-progress` is authoritative; this file is
its versioned mirror.

## Batch 1 — Work Unit 1 / PR 1: `persona` schema, FK closure, primitives, seed

**Status**: COMPLETE (PASS). Date: 2026-08-20. Tasks 1.1–1.16 (16/16).

**Delivery**: `size:exception` accepted for PR 1 (~490 authored lines); `gh`
CLI unavailable on this machine, so the stacked-PR plan lands as one
conventional work-unit commit on `main` per unit (items #1/#2 precedent).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `tests/unit/token.test.ts` | Unit | N/A (new) | ✅ import fail | ✅ 9/9 | ✅ 9 cases (bit-flip token, bit-flip hash, salt order, structural timingSafeEqual freeze) | ➖ None needed |
| 1.2 | — | — | — | — | ✅ `src/server/auth/token.ts` | — | — |
| 1.3 | `tests/unit/kdf.test.ts` | Unit | N/A (new) | ✅ import fail | ✅ 6/6 | ✅ 6 cases (round-trip, wrong secret, PHC params, variant prefix, per-call salt, short secret) | ➖ None needed |
| 1.4 | — | — | — | — | ✅ `src/server/auth/kdf.ts` | — | — |
| 1.5 | — | — | — | — | ✅ `@node-rs/argon2@^2.1.0` installed, native binding verified | — | — |
| 1.6 | `tests/integration/creada-por-fk.test.ts` | Integration | 102/102 baseline | ✅ 5 fail (no `persona`/FK) | ✅ 5/5 after migration | ✅ FK per table, NULL per table, positive control via real persona row | ➖ None needed |
| 1.7 | (same file, written BEFORE 1.6 so the RED was real) | — | — | — | — | — | — |
| 1.8 | — | — | — | — | ✅ migrate applied 0003 to TEST DB | — | — |
| 1.9 | `tests/integration/schema-types.test.ts` | Integration | 1/1 baseline | N/A (gate) | ✅ 1/1 after `npm run db:types` | ➖ | ➖ |
| 1.10 | `tests/integration/seed.test.ts` | Integration | N/A (new) | ✅ import fail | ✅ 5/5 | ✅ 5 cases (clean seed, no-device/no-kitchen-cred, no-op re-run, regenerar, explicit contrasena) | ➖ None needed |
| 1.11 | — | — | — | — | ✅ `scripts/seed.ts` `seedArranque` | — | — |
| 1.12 | — | — | — | — | ✅ `db:seed` script | — | — |
| 1.13 | `tests/unit/sin-contrasena-en-logs.test.ts` | Unit | N/A (new) | ✅ detector-first | ✅ 8/8 | ✅ 7 detector fixtures + real scan | ➖ None needed |
| 1.14 | — | — | — | — | ✅ planted violation CAUGHT, then removed | — | — |
| 1.15 | — | — | — | — | ✅ global-setup seeds directly, no print path | — | — |
| 1.16 | — | — | — | — | ✅ BACKLOG rows #5/#24 carry the obligation | — | — |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command | `npx vitest run tests/unit/token.test.ts tests/unit/kdf.test.ts tests/integration/creada-por-fk.test.ts tests/integration/seed.test.ts tests/unit/sin-contrasena-en-logs.test.ts` → **5 files, 33/33 passed** |
| Runtime harness | `npm test` (real PostgreSQL via `TEST_DATABASE_URL`, ADR-0038) → **21 files, 135/135 passed, twice consecutively** (fixture loop proven stable); `npm run typecheck` clean |
| Rollback boundary | Revert this commit + forward migration dropping the 2 FKs and the 4 tables (dependency order); revert `token.ts`/`kdf.ts`/`seed.ts`/`package.json`/`global-setup.ts`/`migrations.test.ts`; nothing downstream exists yet |

### Deviations from design

- **`seedArranque` accepts `Kysely<DB> \| Transaction<DB>`** and opens its own
  transaction only when it owns the connection. Kysely 0.29 forbids nested
  `.transaction()` entirely (both ControlledTransaction and callback form), so
  the design's "one transaction" holds in production; tests run the seed
  inside the caller's rolled-back transaction. Same pattern #3's later
  transactional procedures must follow.
- **`kdf.ts` omits `algorithm: Algorithm.Argon2id`**: @node-rs/argon2 exports
  `Algorithm` as a const enum, incompatible with the project's
  `isolatedModules`. Argon2id is the library default and the variant is frozen
  behaviorally by the `$argon2id$` PHC-prefix test; m=19456/t=2/p=1 stay
  explicit (D3-E).
- **`migrations.test.ts` updated** (not a listed task): its DROP list,
  expected-migration list, and `(c)` fixture predate 0003. The FK on
  `creada_por` made `(c)`'s bare `creada_por = 1` invalid; it now inserts a
  persona fixture row first. Mirror of what task 2.15 does for other tests.
- **Seed test isolation** uses the callback transaction form with a sentinel
  throw (Kysely 0.29's callback `Transaction` has no `rollback()`).

### Issues found / incidents

- **Dev database (`DATABASE_URL`) advanced to 0003** during this batch: a
  PowerShell override `$env:DATABASE_URL = $env:TEST_DATABASE_URL` evaluated
  to an empty string (TEST_DATABASE_URL lives in `.env`, not the process
  environment), and `loadDotEnv()` then loaded the dev `DATABASE_URL`. The
  dev DB received 0002+0003 (forward-only DDL, no data, no seed). Benign —
  the dev DB was one migration behind and is now current — but the operator
  should know. All later DB-touching commands extract the value from `.env`
  explicitly.
- `@node-rs/argon2@2.1.0` native binding verified on win32 (PHC output
  `m=19456,t=2,p=1`, verify round-trip OK). Linux-x64-gnu (Render) remains a
  `npm ci` check flagged in the proposal risk table.

## Remaining work

- Phase 2 (PR 2, ~600 lines, size:exception accepted): access pipeline —
  cookies, client IP, device verify-and-renew, admin session verify,
  `resolverAcceso`, context/router rewiring (tasks 2.1–2.15).
- Phase 3 (PR 3): `/admin` login + lockout ladder (3.1–3.6).
- Phase 4 (PR 4): mandatory rotation + SEC-09 policy (4.1–4.5).
- Phase 5 (PR 5): device lifecycle (5.1–5.8).
- Phase 6 (PR 6): minimal unstyled `/admin` UI (6.1–6.5).
- Phase 7: final verification & propagation confirmation (7.1–7.5).
