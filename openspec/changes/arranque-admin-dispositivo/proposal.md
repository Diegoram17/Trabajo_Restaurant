# Proposal: Bootstrap, Administrator and Device (BACKLOG #3)

## Intent

A freshly migrated database cannot be operated at all. `configuracion_costos`, `calendario_apertura` and
`configuracion_operativa` ship empty (item #1 moved their seed rows here); `creada_por` is `integer NOT NULL`
pointing at a table that does not exist; and nothing in the codebase authenticates anybody. Item #3 repays
both debts item #1 recorded on this row and opens the bootstrap chain ADR-0034 describes: the seeded
administrator signs into `/admin` **without a device**, rotates the seeded password, enrols the five screens,
and leaves behind the configuration rows every later item divides by.

Behaviour is already settled by ADR-0031/0033/0034/0036/0037/0041/0042. What is missing is **mechanism**: where
session and lockout state live, which Argon2id binding, which client IP to trust, and which literal columns
carry the login credential. This proposal decides those.

## Scope

### In scope

- `persona` table (admin-relevant columns only) + FK closure: `configuracion_costos.creada_por` and
  `calendario_apertura.creada_por` → `persona.id`.
- `dispositivo` table and full token lifecycle: enrol (token shown once), rotate without re-enrolling, revoke,
  verify + renew `expira_en`.
- `/admin` login (usuario + contraseña, Argon2id), server-side session with 60-minute inactivity, mandatory
  first-login rotation with the SEC-09 password policy.
- Three-anchor lockout ladder (5 attempts → 60 s → doubling → 15 min cap → reset on success), persisted.
  Item #3 wires the `cuenta` and `ip` anchors; the `dispositivo` anchor value ships unused for #5/#11.
- Configuration seed rows, authored by the seeded administrator, written by a new idempotent TypeScript seed
  step (`scripts/seed.ts`), not by a `.sql` migration.
- Cookie plumbing in the existing `node:http` pipeline and in the tRPC `Context` (read `Cookie`, emit
  `Set-Cookie`), plus header-level assertions of `Secure`/`SameSite` — item #1's third inherited obligation.
- Minimal, unstyled `/admin` screens for login, forced rotation and device management, so the bootstrap chain
  is walkable with no manual intervention outside the system.
- Propagation: new ADR row in `TECH-DESIGN.md`, new entities in its data model, new acceptance criteria, and
  inherited-obligation notes on BACKLOG rows #5 and #24.

### Out of scope

- Mesero PIN and station session (#5); cocina PIN / `CredencialCocina` (#11).
- The SSE endpoint, `EventoOperacion`, role filtering and `Last-Event-ID` (#4). #3 ships the reusable
  verify-and-renew function that #4 wires in.
- Parameters/calendar **editing** screens, `0..10000` basis-point range `CHECK`s and versioned writes (#25).
- Personnel management, PIN regeneration, `sueldo_fijo` (#24). Pendientes review (#27).
- `DESIGN.md` visual system for `/admin`. Second factor (out of scope by ADR-0031).

## Decisions on the ten open questions

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Argon2id library | `@node-rs/argon2`, pinned | Prebuilt napi binaries: no `node-gyp` on the Windows dev machine, none on Render's linux-x64. Async on the threadpool, so the single process is not blocked. Pure-JS cannot hold `> 50 ms` verify without blocking. |
| 2 | Session storage | **Server-side `sesion_admin` table**; id is a ≥128-bit CSPRNG value, `token_hash` = SHA-256 + `token_sal` | Revocable: rotating the password must kill other sessions, and `/admin` has no second factor. A stateless signed cookie would need a **new signing secret with no rotation story** — the exact cost ADR-0033 already regretted for the CA key. ADR-0036's entropy rule classifies the session id with no new decision. **Needs a new ADR.** |
| 3 | Lockout storage | **Persisted `bloqueo_acceso` table**, keyed `(ancla, valor_ancla)` where `ancla ∈ dispositivo \| cuenta \| ip` | Render sleeps and restarts. In-memory counters reset with no symptom — "un contador mal anclado no falla: simplemente no protege". Persisting also makes the three anchors testable against real PostgreSQL (ADR-0038). **Same ADR as #2.** |
| 4 | Client IP | Take the entry `hops` from the right of `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`, default `1`); fall back to `req.socket.remoteAddress` when absent (dev); normalise `::ffff:` IPv4 mapping; **fail closed to a constant bucket** when unresolvable | The rightmost hop is what the trusted edge observed; the leftmost is caller-supplied. Extends exactly the trust already given to `X-Forwarded-Proto`. Normalising matters: two spellings of one client would be two buckets, so the counter would silently under-protect. |
| 5 | Admin seed | New `scripts/seed.ts` (`npm run db:seed`): one transaction — admin + configuration rows — idempotent (no-op when an `administrador` exists), password printed once to stdout only. Exports `seedArranque(db, { contrasena? })` returning the plaintext, so `tests/setup/global-setup.ts` seeds a fixture without the print path | `scripts/migrate.ts` executes static `.sql` verbatim and cannot compute a hash or print anything. `creada_por` forces the config rows into the same process, after the admin id exists. |
| 6 | Login column names | `usuario` (unique, stored lowercase), `contrasena_hash` (Argon2id PHC string, salt embedded), `debe_rotar_contrasena boolean NOT NULL` | ADR-0040: Spanish, mirroring `pin_hash`. An explicit flag beats inferring "still equals the seeded hash": the inference has no state to test and fails silently. New names ⇒ must land in `TECH-DESIGN.md`. |
| 7 | `Persona` shape | **Incremental.** #3 creates `nombre, rol, usuario, contrasena_hash, debe_rotar_contrasena, activo`. `pin_hash` lands with #5, `sueldo_fijo` with #24, each recorded on its BACKLOG row | Shipping `pin_hash` now creates a column with no writer, no uniqueness check and no rule — the failure this project has already diagnosed twice. Column and rule ship together. |
| 8 | Seed values | `pct_igv = 1800`, `pct_comision = 500` (PRD). `salario_cocina`, `salario_administrativo`, `costos_indirectos_mensuales`, `pct_merma` = **`0`**. `abre_*` = all seven `true`. `configuracion_operativa` = declared placeholders `umbral_demora_min = 15`, `inactividad_sesion_min = 5`. `vigente_desde = now()` | Zero is the only arithmetically inert money value: a plausible salary produces a wrong margin that still reconciles — the project's named failure mode. With fixed costs at `0` the calendar divisor moves no money, so a seven-day pattern is safe and lets the simulated scenario run any weekday. The two operational values change no importe, so a wrong one fails visibly; both are labelled arbitrary in the seed and are #25's to set. `now()` passes #2's `vigencia_no_retroactiva` trigger (same operational day). |
| 9 | `expira_en` renewal, #3 vs #4 | #3 owns one function `verificarDispositivo(db, cookie, ahora)` → device or typed rejection (`ausente\|invalido\|vencido\|revocado`), which **renews as part of a successful verification, writing at most once per device per day** (renew only when remaining life < 89 d). #4 calls it from the SSE GET and adds no rule | Single write path, no per-caller opt-in — the `origin-guard.ts` lesson. Bounding the write keeps renewal off #4's hot path. Same bounded-write rule applies to `sesion_admin.ultima_actividad_en` (≤ once per minute). |
| 10 | Chained PRs | **Yes — forecast High** against the 400-line budget. Four vertical slices: (1) `persona` + FK closure + Argon2id wrapper + seed; (2) `/admin` access: session, login, rotation + policy, lockout, client IP; (3) `dispositivo` lifecycle; (4) minimal `/admin` UI. Slice 2 is the largest and may split into login/session/lockout and rotation/policy | Three independent surfaces plus a UI. `sdd-tasks` must emit the guard lines and record the resolved strategy in `tasks.md`. |

## New architecture requiring an ADR

One genuinely new decision, with two applications: **ephemeral security state (`/admin` session, lockout
counters) lives in PostgreSQL, not in the process.** No existing ADR names it, and it adds two entities
`TECH-DESIGN.md` does not model. `sdd-design` must author that ADR (next free number, MADR, append-only) plus
its row in the *Decisiones de arquitectura* table; this proposal does not write it. Everything else — hashing,
cookie attributes, anchors, bootstrap order, token lifetime — is implementation of settled ADRs.

## Capabilities

### New capabilities

- `system-bootstrap`: seeded administrator, one-time password, configuration seed rows, `creada_por` closure,
  the whole chain walkable from an empty database.
- `admin-access`: `/admin` login, server-side session with 60-minute inactivity, cookie attributes, mandatory
  first-login rotation and the SEC-09 password policy.
- `access-throttling`: persisted three-anchor lockout ladder and trusted client-IP resolution (reused by #5/#11).
- `device-credential`: `dispositivo` entity, ≥128-bit token, SHA-256 + salt, enrol/rotate/revoke,
  verify-and-renew.

### Modified capabilities

- `base-schema`: `creada_por` gains its foreign key; configuration tables gain their first rows.

## Approach

Exploration's approach 2, unchanged: keep the five-step `node:http` pipeline and add small dedicated modules in
`origin-guard.ts`'s style — cookie serialise/parse, password hash/verify, session issue/verify/renew, device
token issue/verify/renew, lockout ledger. Two new runtime dependencies only: `@node-rs/argon2` and `cookie`.
Cookie reading and writing enter through the pipeline and `createContextFactory` (its signature already receives
`{ req, res }` and discards them), so no procedure opts in. Cookies use the `__Host-` prefix on the single
origin (ADR-0037): `__Host-sesion` (`SameSite=Strict`), `__Host-dispositivo` (`SameSite=Lax`), both
`Secure·HttpOnly`. The device cookie carries `{id}.{token}` so a salted hash can still be located by id.
Attribute correctness is proven by asserting the literal `Set-Cookie` string in integration tests, which needs
no TLS — exactly what ADR-0041 asks of this item.

## Affected areas

| Area | Impact | Description |
|---|---|---|
| `migrations/0003_*.sql` | New | `persona`, `dispositivo`, `sesion_admin`, `bloqueo_acceso`; FK closure on both `creada_por` |
| `scripts/seed.ts`, `package.json` | New/Modified | Idempotent seed + `db:seed`; `@node-rs/argon2`, `cookie` |
| `src/server/db/schema.d.ts` | Modified | Regenerated via `npm run db:types`; drift test is the gate |
| `src/server/trpc/context.ts`, `router.ts`, `app-router.ts` | Modified | Cookie-aware context, `adminProcedure`, real routers |
| `src/server/index.ts` | Modified | Cookie parsing and client-IP resolution in the pipeline |
| `src/server/auth/*` (new modules) | New | hash, session, device token, lockout, client IP |
| `src/client/admin/*` | New | Minimal login, rotation and device screens |
| `tests/unit`, `tests/integration`, `tests/setup/global-setup.ts` | New/Modified | Real-PostgreSQL suites (ADR-0038); seed the fixture admin |
| `TECH-DESIGN.md`, `adrs/`, `BACKLOG.md` | Modified | ADR + table row + data model + criteria; obligations recorded on #5/#24 |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@node-rs/argon2` prebuilt missing on Render's target | Low | Pin the version; verify `npm ci` on linux-x64-gnu in slice 1; documented fallback to `argon2` |
| Lockout anchored wrongly — silent non-protection | Med | Each of the three anchors gets its own real-PostgreSQL test, including 200 automated attempts (existing criterion) |
| `X-Forwarded-For` shape differs from the assumption | Med | Hop count is configuration, not a constant; unresolvable IP fails closed into a shared bucket, never into "no counter" |
| Item exceeds the 400-line review budget | High | Four vertical slices; `sdd-tasks` emits the guard lines |
| Placeholder seed values read later as decided | Med | `0` for money, labelled in the seed script and in the migration comment; #25 owns the real values |
| Losing the one-time password bricks a fresh database | Med | `npm run db:seed -- --regenerar-contrasena` re-prints a new one and re-arms `debe_rotar_contrasena`; it grants no authority its operator does not already hold |
| Renewal bug surfaces 90 days later (ADR-0036 cost) | Low | `verificarDispositivo` takes `ahora` as a parameter, so expiry and renewal are tested at simulated time |

## Rollback plan

Migrations are forward-only and no down path exists, so rollback is a **new forward migration** plus
`git revert` of the code, in this order:

1. `git revert` the slice's commits — the process stops issuing and reading cookies.
2. New migration: drop the two FK constraints on `creada_por`, then `bloqueo_acceso`, `sesion_admin`,
   `dispositivo`, then `persona`. `creada_por` returns to `integer NOT NULL` with no FK, exactly item #1's state.
3. Seeded configuration rows: delete only if `persona` is being dropped, since `creada_por` would dangle.
4. `npm run db:types` to regenerate `schema.d.ts`; the drift test confirms the revert is complete.

Slice-level rollback is cheaper: slices 2–4 revert with code only, because their tables are inert without a
caller. Dropping `persona` locks `/admin` out, so on any database holding real rows the sequence is revert
code, keep schema, and fix forward. The seed is idempotent, so re-running after a restore is safe. In this
academic project the practical path is a fresh Neon branch plus `npm run migrate && npm run db:seed`.

## Dependencies

- Item #1 (`3ea1d54`) and item #2 (`76729cc`), both merged into `main`.
- Two new runtime dependencies: `@node-rs/argon2`, `cookie`.
- `sdd-design` must author the session/lockout-state ADR before apply.

## Assumptions needing user confirmation

1. Money seed values are `0` rather than plausible amounts; `pct_merma = 0`.
2. The seeded calendar opens all seven days.
3. `umbral_demora_min = 15` and `inactividad_sesion_min = 5` are arbitrary placeholders, not product decisions.
4. The seeded username is `admin`.
5. A minimal unstyled `/admin` UI is inside item #3, so the bootstrap chain is walkable end to end.

## Success criteria

- [ ] From an empty database, `npm run migrate && npm run db:seed` prints one password once, and no
      `CredencialCocina` and no `Dispositivo` exist.
- [ ] Signing into `/admin` with that password forces rotation; rotating to under 12 characters, to the seeded
      password, or to a common-list password fails with the reason explained.
- [ ] `/admin` login succeeds with no device cookie present (ADR-0034).
- [ ] Login and rotation emit `Set-Cookie` with `Secure`, `HttpOnly`, `SameSite=Strict`; enrolment emits
      `SameSite=Lax`; asserted on the literal header without TLS (ADR-0041).
- [ ] Five failed logins block for 60 s, the next block for 120 s, capped at 15 min, reset on success — proven
      separately for the `cuenta` and `ip` anchors, and surviving a process restart.
- [ ] An unknown `usuario` and a wrong password are indistinguishable in response and in timing.
- [ ] Enrolling twice produces tokens with no deducible relation; a revoked, an expired and a rotated-away
      token are all rejected; verifying a device token costs well under the `> 50 ms` Argon2id floor.
- [ ] A successful verification renews `expira_en` to 90 days and writes at most once per device per day.
- [ ] `configuracion_costos` and `calendario_apertura` each hold one row whose `creada_por` resolves to the
      seeded administrator; `configuracion_operativa` holds its single row.
- [ ] `npm test` passes against real PostgreSQL, including the `schema.d.ts` drift test.
- [ ] `TECH-DESIGN.md`, the new ADR and `BACKLOG.md` rows #5/#24 are updated in the same change.
