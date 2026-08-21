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

## Batch 2 — Work Unit 2 / PR 2: access pipeline (cookies, client IP, device/session verify, context rewiring)

**Status**: COMPLETE (PASS). Date: 2026-08-20. Tasks 2.1–2.15 (15/15).

**Delivery**: `size:exception` accepted for PR 2 (~600 authored lines estimate); same
one-commit-per-work-unit pattern as PR 1 (`gh` CLI unavailable).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `tests/unit/ip-cliente.test.ts` | Unit | N/A (new) | ✅ import fail | ✅ 7/7 | ✅ 7 cases (rightmost-of-hops x3, socket fallback, `::ffff:` on header, `::ffff:` on socket, hops>length, spoofed leftmost, no-header+no-socket) | ➖ None needed |
| 2.2 | — | — | — | — | ✅ `src/server/auth/ip-cliente.ts` | — | — |
| 2.3 | `tests/unit/cookies.test.ts` | Unit | N/A (new) | ✅ import fail | ✅ 6/6 | ✅ 6 cases (sesion attrs, dispositivo attrs+Max-Age, append-not-overwrite, leerCookies parse, leerCookies empty, constant literals) | ➖ None needed |
| 2.4 | — | — | — | — | ✅ `src/server/auth/cookies.ts` (+ `cookie@2.0.1` dependency) | — | — |
| 2.5 | — | — | — | — | ✅ `package.json`/`package-lock.json` | — | — |
| 2.6 | `tests/integration/dispositivo-verificar.test.ts` | Integration | 173/173 baseline (pre-batch full suite) | ✅ import fail | ✅ 11/11 | ✅ 11 cases (ausente x1, malformed x1, invalido-no-row, revocado-over-valid-token, vencido, invalido-wrong-token, renew-under-89d, no-write-at-104d, at-most-once-same-instant, <50ms cost, sanity valido) | ➖ None needed |
| 2.7 | — | — | — | — | ✅ `src/server/auth/dispositivo.ts` (`verificarDispositivo` only) | — | — |
| 2.8 | `tests/integration/sesion-admin-verificar.test.ts` | Integration | N/A (new file, new module) | ✅ import fail | ✅ 10/10 | ✅ 10 cases (round-trip, ausente, malformed, invalido-no-row, invalido-wrong-token, revocada, revocation-scoped-to-persona, T+59min advances, T+61min expires, throttle ≤1/min) | ➖ None needed |
| 2.9 | — | — | — | — | ✅ `src/server/auth/sesion-admin.ts` (`crearSesionAdmin`/`verificarSesionAdmin`/`revocarSesionesDePersona`) | — | — |
| 2.10 | `tests/unit/env.test.ts` (extended) | Unit | 4/4 baseline (pre-existing `loadEnv` tests) | ✅ 5 new cases fail (`trustedProxyHops` undefined) | ✅ 8/8 | ✅ 5 new cases (default=1, explicit valid x2, non-integer rejected x2, negative rejected) | ➖ None needed |
| 2.11 | — (exercised transitively by 2.15's pipeline tests) | — | — | ➖ composition of already-tested primitives, no dedicated RED per Work Unit 2's own focused-test list | ✅ `src/server/auth/acceso.ts`: `resolverAcceso` + `Context` type | — | — |
| 2.12 | — (same) | — | — | — | ✅ `src/server/trpc/context.ts`: `Context` re-exported from `acceso.ts`; `createContextFactory(db, hops)` async | — | — |
| 2.13 | — (same) | — | — | — | ✅ `src/server/index.ts`: `ServerConfig.hops`, threaded from `loadEnv().trustedProxyHops` | — | — |
| 2.14 | — (same) | — | — | — | ✅ `src/server/trpc/router.ts`: `adminProcedure` (session-valid gate only, no D3-F yet) | — | — |
| 2.15 | `tests/integration/{http-pipeline,trpc,routes,transport}.test.ts` | Integration | Pre-existing suites, all green before edit | ➖ mechanical signature update, not new behavior | ✅ all 4 files pass with `hops: 1` added to `createServer(...)` | ➖ | ➖ |

### Test Summary

- **Total tests written this batch**: 34 (7 + 6 + 11 + 10 unit/integration) + 5 new
  `env.test.ts` cases = 39 new assertions-bearing tests.
- **Total tests passing (focused command)**: 34/34.
- **Total tests passing (full suite, `npm test`)**: 173/173, run twice consecutively
  for stability.
- **Layers used**: Unit (13: 7 ip-cliente + 6 cookies, plus 5 env.test.ts extensions
  counted within the 8-file total), Integration (21: 11 dispositivo + 10 sesion-admin).
- **Approval tests** (refactoring): None — no refactoring tasks this batch.
- **Pure functions created**: `resolveClientIp`, `normalizarIp` (ip-cliente.ts);
  `leerCookies`, `agregarSetCookie` builds a pure string then does one I/O append
  (cookies.ts); `analizarCookie` (private, duplicated in `dispositivo.ts` and
  `sesion-admin.ts` — see deviations).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command | `npx vitest run tests/unit/ip-cliente.test.ts tests/unit/cookies.test.ts tests/integration/dispositivo-verificar.test.ts tests/integration/sesion-admin-verificar.test.ts` → **4 files, 34/34 passed** |
| Runtime harness | `npm test` (real PostgreSQL via `TEST_DATABASE_URL`, ADR-0038) → **25 files, 173/173 passed, twice consecutively**; `npm run typecheck` clean (both `tsconfig.json` and `tsconfig.server.json`) |
| Rollback boundary | Revert this commit; `cookies.ts`/`ip-cliente.ts`/`dispositivo.ts` (verify-only)/`sesion-admin.ts`/`acceso.ts` are all new files with no other caller yet; `env.ts`/`index.ts`/`context.ts`/`router.ts`/the 4 pipeline test files revert their diffs cleanly — `Context` reverts to `{ db }`, nothing downstream depends on the richer shape yet |

### Deviations from design

- **`Context.cookies.emitir` signature**: the design's "Interfaces" section
  shows `cookies: { emitir(valor: string): void }` (one string parameter).
  That under-specifies which of `COOKIE_SESION`/`COOKIE_DISPOSITIVO` (and
  which `SameSite`/`Max-Age`) is being set, and no Phase 3/5 procedure can
  reach the raw `res` object to build the full `Set-Cookie` line itself
  (`Context` deliberately has no `res` field). Implemented instead as
  `emitir(nombre: string, valor: string, opciones: OpcionesCookie): void`,
  a thin wrapper over `agregarSetCookie` with `res` bound via closure in
  `resolverAcceso`. This is the literal, already-fully-specified shape
  `cookies.ts` exports, so "attribute correctness is one edit" still holds
  with zero duplication in future Phase 3/5 callers. Flagged for the next
  apply batch (PR 3, login) to confirm this shape is what it needs.
- **`Context` type physically lives in `src/server/auth/acceso.ts`**, not in
  `src/server/trpc/context.ts` as the design's code-block placement
  suggested. `trpc/context.ts` does `export type { Context } from
  '../auth/acceso.js'`. Reasoning: `resolverAcceso` is described as
  producing "one Context, reused by two callers" (tRPC + #4's future SSE
  `GET`), so the type is co-located with the function that produces it,
  avoiding a circular value/type import between `acceso.ts` and
  `context.ts`. `context.ts` still satisfies task 2.12's literal shape
  requirement (`Context { db, ip, dispositivo, sesion, cookies }`) via the
  re-export; `createContextFactory` still lives there and is still the
  thing `index.ts` calls.
- **Credential-parsing helper (`analizarCookie`, splits `"{id}.{token}"`) is
  duplicated locally** in `dispositivo.ts` (id: numeric string) and
  `sesion-admin.ts` (id: opaque CSPRNG hex string) rather than factored into
  a shared export. Neither the design's module map nor its "Interfaces"
  section assigns this responsibility to any module, and the two id shapes
  differ (device: sequential integer; session: `sesion_admin.id`'s own
  128-bit CSPRNG handle per D3-C), so a shared helper would need a
  discriminant anyway. Two ~8-line private functions were judged simpler
  than premature sharing; `token.ts` (already tested/complete from PR 1)
  was left untouched.
- **Device/session token encoding is hex**, chosen here since neither the
  design nor PR 1 fixed it: cookie value is `"{id}.{tokenHexEncoded}"`
  (64 lowercase hex chars for the 32-byte token). This is now the
  constraint Phase 5's `enrolarDispositivo`/`presentarDispositivo` and
  Phase 3's `admin.iniciarSesion` MUST match when they build the same
  cookie value — flagged explicitly since it is load-bearing for later PRs.
- **`vencido`/`renovable` (dispositivo) and `expirada`/`debeActualizar`
  (sesion-admin) are computed as extra `sql<boolean>` columns appended via
  `.selectAll().select([...])`**, matching `vigencias.ts`'s `instanteSql`
  pattern (D3-B: every temporal comparison in SQL, never `new Date()` in
  Node). Renewal/write uses `make_interval(days => N)` /
  `make_interval(mins => N)` with the day/minute count passed as a bound
  `${}` parameter (never `sql.raw()`), keeping
  `tests/unit/sin-sql-interpolado.test.ts` green.

### Issues found / incidents

- **`PROGRESS.md` was not updated when PR 1 (batch 1) closed**, despite
  `CLAUDE.md` rule 8 ("fase cerrada sin su fila actualizada es fase sin
  cerrar"). Row #3 still read "planning cerrado — listo para apply" with no
  mention of PR 1 being merged. Corrected in this batch's commit: row #3
  now reflects both PR 1 and PR 2 as applied and merged, PR 3 pending.
- No `DATABASE_URL`/`TEST_DATABASE_URL` PowerShell mix-up this batch — every
  DB-touching command relied on `loadDotEnv()` reading `.env` directly
  (the documented fix from batch 1), never on an inherited `$env:` override.
- `cookie@2.0.1` (jshttp/cookie's rewrite) has a different runtime API than
  the classic `parse`/`serialize` pair: it exports `parseCookie`,
  `stringifySetCookie` (used here), `parseSetCookie`, `stringifyCookie`.
  ESM-only (`"type": "module"`, no CJS build) — irrelevant here since the
  whole project is ESM, but worth noting for anyone reading older `cookie`
  package docs/examples.

## Remaining work

- Phase 3 (PR 3): `/admin` login + lockout ladder (3.1–3.6).
- Phase 4 (PR 4): mandatory rotation + SEC-09 policy (4.1–4.5).
- Phase 5 (PR 5): device lifecycle (5.1–5.8).
- Phase 6 (PR 6): minimal unstyled `/admin` UI (6.1–6.5).
- Phase 7: final verification & propagation confirmation (7.1–7.5).
