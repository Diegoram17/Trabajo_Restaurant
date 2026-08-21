# Tasks: Bootstrap, Administrator and Device (BACKLOG #3)

## Preflight decisions (this session â€” binding for `sdd-apply`)

- `delivery_strategy: ask-on-risk` â€” the forecast below confirmed risk; the user resolved it as
  **`size:exception` accepted for PR 1 and PR 2** (no further independent cut exists for either
  without shipping a candidate that does not compile or test standalone).
- `review_budget_lines: 400`
- `chain_strategy: stacked-to-main` â€” each PR targets the previous PR branch or `main` in sequence,
  merging as it is approved.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,370 total (authored additions+deletions; generated `schema.d.ts` excluded, included in snapshot identity only) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 â†’ PR 2 â†’ PR 3 â†’ PR 4 â†’ PR 5 â†’ PR 6 (6 units, strict dependency order, `stacked-to-main`) |
| Delivery strategy | ask-on-risk â†’ resolved: `size:exception` on PR 1 and PR 2 |
| Chain strategy | `stacked-to-main` |

Decision needed before apply: No â€” resolved by the user (`size:exception` on PR 1/PR 2, chain
strategy `stacked-to-main`)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High (accepted via size:exception on PR 1 and PR 2)

**Slice 2 of the proposal's original 4 (`/admin` access) is split further here**, per proposal
decision Q10's own suggestion, into PR 2 (pipeline plumbing + verification) and PR 3
(login endpoint + lockout ladder). Even after that split, **PR 1 (~500 lines) and PR 2
(~600 lines) still exceed the 400-line budget on their own** â€” the schema/primitives/seed surface
and the pipeline/context rewiring do not decompose further without shipping a candidate that does
not compile or test standalone. Flag both explicitly to the user: accept `size:exception` for those
two units, or accept a larger stacked-PR count that trades granularity for a genuinely-independent
diff (not offered here because no further independent cut exists).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `persona` schema, FK closure on `creada_por`, Argon2id/token primitives, idempotent seed | PR 1 (~500 lines, over budget â€” flag for `size:exception` or acceptance) | `npx vitest run tests/unit/token.test.ts tests/unit/kdf.test.ts tests/integration/creada-por-fk.test.ts tests/integration/seed.test.ts tests/unit/sin-contrasena-en-logs.test.ts` | Real PostgreSQL (ADR-0038), `TEST_DATABASE_URL` | Forward migration dropping the 2 FKs + 4 new tables; revert `kdf.ts`/`token.ts`/`scripts/seed.ts`; nothing downstream exists yet |
| 2 | Access pipeline plumbing: cookies, client IP, device verify-and-renew, admin session verify | PR 2 (~600 lines, over budget â€” flag for `size:exception` or acceptance) | `npx vitest run tests/unit/ip-cliente.test.ts tests/unit/cookies.test.ts tests/integration/dispositivo-verificar.test.ts tests/integration/sesion-admin-verificar.test.ts` | Real PostgreSQL, `TEST_DATABASE_URL` | Revert `cookies.ts`/`ip-cliente.ts`/`dispositivo.ts` (verify-only)/`sesion-admin.ts`/`acceso.ts`/`env.ts`/`index.ts`/`context.ts`/`router.ts`; `Context` reverts to `{ db }`, no caller depends on the richer shape yet |
| 3 | `/admin` login endpoint + persisted three-anchor lockout ladder | PR 3 (~375 lines) | `npx vitest run tests/integration/sin-contador-en-memoria.test.ts tests/integration/bloqueo.test.ts tests/integration/admin-login.test.ts` | Real PostgreSQL â€” restart-survival test destroys/rebuilds the pool mid-test | Revert `bloqueo.ts` + `admin.iniciarSesion`/`admin.cerrarSesion`; login becomes unreachable, nothing downstream calls it yet |
| 4 | Mandatory first-login rotation + SEC-09 password policy | PR 4 (~255 lines) | `npx vitest run tests/unit/contrasena.test.ts tests/integration/rotacion-obligatoria.test.ts` | Real PostgreSQL | Revert `contrasena.ts` + the D3-F gate in `router.ts` + `admin.rotarContrasena`; `adminProcedure` reverts to PR 2's plain session check |
| 5 | Device lifecycle: enrol, present, rotate, revoke | PR 5 (~385 lines) | `npx vitest run tests/integration/dispositivo-enrolar.test.ts tests/integration/dispositivo-presentar.test.ts tests/integration/dispositivo-rotar-revocar.test.ts` | Real PostgreSQL | Revert the 4 lifecycle exports added to `dispositivo.ts` + their procedures; `verificarDispositivo` (PR 2) is untouched |
| 6 | Minimal unstyled `/admin` UI (login, rotation, device panel) | PR 6 (~255 lines) | N/A â€” no client test harness decided (proposal assumption #5); manual walkthrough | N/A automated; manual loopback-HTTP walkthrough per design's open question on `Secure` cookies at `127.0.0.1` | Revert `src/client/admin/*` and `Admin.tsx` to the placeholder; no server code depends on the UI |

## Phase 1: `persona`, FK closure, Argon2id/token primitives, seed (PR 1)

- [x] 1.1 RED `tests/unit/token.test.ts`: two `generarToken()` calls unrelated; one-bit change fails `tokenCoincide`; comparison is `timingSafeEqual`
- [x] 1.2 GREEN `src/server/auth/token.ts`: `generarToken`, `hashearToken`, `tokenCoincide` (ADR-0036 high-entropy branch)
- [x] 1.3 RED `tests/unit/kdf.test.ts`: `hashearCredencial`/`verificarCredencial` round-trip; wrong secret rejected; PHC string embeds pinned params (D3-E)
- [x] 1.4 GREEN `src/server/auth/kdf.ts`: pinned Argon2id (m=19456 KiB, t=2, p=1), async on the threadpool
- [x] 1.5 `package.json`: add `@node-rs/argon2`, pinned version
- [x] 1.6 Create `migrations/0003_acceso.sql`: `persona`, `dispositivo`, `sesion_admin`, `bloqueo_acceso` + the 2 `creada_por` FKs (exact DDL from design.md, `text`+`CHECK` enums, no `DEFAULT` on decision columns)
- [x] 1.7 RED `tests/integration/creada-por-fk.test.ts`: nonexistent `creada_por` rejected by the FK; null `creada_por` rejected by `NOT NULL`
- [x] 1.8 GREEN: `npm run migrate` against `TEST_DATABASE_URL`; confirm 1.7 passes
- [x] 1.9 `npm run db:types`; confirm existing `tests/integration/schema-types.test.ts` drift gate passes with no manual edit
- [x] 1.10 RED `tests/integration/seed.test.ts`: clean seed creates 1 admin + 3 config rows with resolvable `creada_por`, 0 `CredencialCocina`, 0 `dispositivo`; re-run is a no-op; `--regenerar-contrasena` re-arms `debe_rotar_contrasena` and reprints
- [x] 1.11 GREEN `scripts/seed.ts`: `seedArranque(db, { contrasena?, regenerarContrasena? })` â€” one transaction, `ON CONFLICT (usuario) DO NOTHING` on `persona`, `INSERT ... WHERE NOT EXISTS` per config table
- [x] 1.12 `package.json`: `db:seed` script wraps `seedArranque`, prints the plaintext to stdout exactly once
- [x] 1.13 RED `tests/unit/sin-contrasena-en-logs.test.ts`: structural audit â€” `seedArranque` returns the password only via `ResultadoSeed.contrasena`; no `console.*`/logger call carries it anywhere in `scripts/seed.ts` except the CLI entrypoint's single documented print
- [x] 1.14 GREEN: confirm 1.13 passes against 1.11/1.12 (no production fix expected â€” this proves the boundary, matching `sin-sql-interpolado.test.ts`'s pattern: plant a violation, confirm it's caught, remove it)
- [x] 1.15 Modify `tests/setup/global-setup.ts`: call `seedArranque(db)` directly for the fixture admin, capture the plaintext as a return value, never through the print path
- [x] 1.16 `BACKLOG.md`: add the inherited-obligation note to row #5 (`pin_hash` column lands there, `persona` ships without it now) and row #24 (`sueldo_fijo` lands there) â€” proposal decision Q7

## Phase 2: Access pipeline â€” cookies, client IP, device verify, session verify (PR 2)

- [ ] 2.1 RED `tests/unit/ip-cliente.test.ts`: rightmost-of-`hops`; absent header â†’ `socket.remoteAddress`; `::ffff:` normalisation; `hops` > list length â†’ `IP_DESCONOCIDA`; spoofed leftmost entry ignored â€” the threat-matrix RED tests for the `X-Forwarded-For` trust boundary
- [ ] 2.2 GREEN `src/server/auth/ip-cliente.ts`: `resolveClientIp(req, hops)`, `IP_DESCONOCIDA` â€” fails closed, never uncounted
- [ ] 2.3 RED `tests/unit/cookies.test.ts`: literal `__Host-sesion`/`__Host-dispositivo` strings with correct `Secure`/`HttpOnly`/`SameSite`/`Path=/`, no `Domain`; `agregarSetCookie` appends to an existing header instead of overwriting it
- [ ] 2.4 GREEN `src/server/auth/cookies.ts`: `leerCookies`, `agregarSetCookie`, `COOKIE_SESION`, `COOKIE_DISPOSITIVO`
- [ ] 2.5 `package.json`: add `cookie` dependency
- [ ] 2.6 RED `tests/integration/dispositivo-verificar.test.ts`: `ausente`/`invalido`/`vencido`/`revocado` classification; renewal at <89d remaining life, no write at â‰¥89d; at-most-once-per-day; verification cost well under 50ms â€” fixtures inserted via direct SQL (no `enrolarDispositivo` yet)
- [ ] 2.7 GREEN `src/server/auth/dispositivo.ts`: `ResultadoDispositivo` type + `verificarDispositivo(db, cookie, ahora?)` only â€” the rest of this module lands in Phase 5
- [ ] 2.8 RED `tests/integration/sesion-admin-verificar.test.ts`: `ResultadoSesion` mirrors `ResultadoDispositivo`'s shape (D3-C, same `{id}.{token}` construction); session valid + `ultima_actividad_en` advances at T+59min; expired at T+61min; write throttled to â‰¤1/min
- [ ] 2.9 GREEN `src/server/auth/sesion-admin.ts`: `crearSesionAdmin`, `verificarSesionAdmin`, `revocarSesionesDePersona`
- [ ] 2.10 Modify `src/server/config/env.ts`: `TRUSTED_PROXY_HOPS` (default `1`, validated integer â‰¥ 0)
- [ ] 2.11 GREEN `src/server/auth/acceso.ts`: `resolverAcceso(db, req, res, hops, ahora?)` composing 2.2/2.4/2.7/2.9 into one `Context`
- [ ] 2.12 Modify `src/server/trpc/context.ts`: `Context { db, ip, dispositivo, sesion, cookies }`; `createContextFactory(db, hops)` becomes async, delegates to `resolverAcceso`
- [ ] 2.13 Modify `src/server/index.ts`: thread `hops` from `loadEnv()` into `ServerConfig`/`createContextFactory` â€” no change to the 5-step pipeline order (D3-K: `resolverAcceso` is one function, reused later by #4's SSE `GET`)
- [ ] 2.14 Modify `src/server/trpc/router.ts`: `adminProcedure = t.procedure.use(...)` rejecting unless `ctx.sesion.estado === 'valido'` â€” the D3-F rotation gate is not added yet, that's Phase 4
- [ ] 2.15 Modify `tests/integration/{http-pipeline,trpc,routes,transport}.test.ts`: pass `hops` where the new `createContextFactory` signature requires it (mirrors the pattern used when `db` was threaded in for item #2)

## Phase 3: `/admin` login + persisted lockout ladder (PR 3)

- [ ] 3.1 RED `tests/integration/sin-contador-en-memoria.test.ts`: block a `cuenta` key, destroy and rebuild the `Kysely`/pool (simulated restart), confirm still blocked â€” proves no in-process `Map` holds the counter (ADR-0043's point)
- [ ] 3.2 RED `tests/integration/bloqueo.test.ts`: 5â†’60s, doubling 120/240/480/900s cap, integer-only arithmetic; success `DELETE`s the row; `cuenta` and `ip` anchors verified independently (a locked `ip` does not block an unlocked `cuenta` from a different IP); 200 concurrent failed attempts leave exact `fallos_consecutivos`/`bloqueos_consecutivos` (no lost update)
- [ ] 3.3 GREEN `src/server/auth/bloqueo.ts`: `estadoBloqueo`, `registrarFallo` (single `INSERT ... ON CONFLICT DO UPDATE`, design's exact SQL), `registrarAcierto` (`DELETE`)
- [ ] 3.4 RED `tests/integration/admin-login.test.ts`: login succeeds with no `__Host-dispositivo` cookie (ADR-0034); unknown `usuario` vs wrong `contrasena` â€” identical response shape and comparable timing via the decoy `HASH_SENUELO` computed once at module load; literal `Set-Cookie: __Host-sesion=...; Secure; HttpOnly; SameSite=Strict; Path=/`; a locked `cuenta`/`ip` is rejected before any hash comparison runs
- [ ] 3.5 GREEN `src/server/trpc/app-router.ts`: `admin.iniciarSesion` â€” `estadoBloqueo` first, decoy-hash path for unknown `usuario`, `registrarFallo`/`registrarAcierto`, `crearSesionAdmin`, `cookies.emitir`
- [ ] 3.6 GREEN same file: `admin.cerrarSesion` (`adminProcedure`) â€” marks the current session's `revocada_en`

## Phase 4: Mandatory rotation + SEC-09 password policy (PR 4)

- [ ] 4.1 RED `tests/unit/contrasena.test.ts`: <12 chars rejected with its own reason; equal to current/seeded rejected with its own reason; common-list hit rejected with its own reason; compliant password accepted
- [ ] 4.2 GREEN `src/server/auth/contrasena.ts`: `validarContrasenaNueva`, `CONTRASENAS_COMUNES` (small embedded list, D3-I â€” no new dependency)
- [ ] 4.3 RED `tests/integration/rotacion-obligatoria.test.ts`: while `debe_rotar_contrasena = true`, every `adminProcedure` action except `admin.rotarContrasena`/`admin.cerrarSesion` is rejected server-side with the pending-rotation reason; a compliant rotation clears the flag; rotation revokes every other session of that `persona` (two cookie jars) and issues a fresh `Set-Cookie` for the acting session, same transaction (D3-G)
- [ ] 4.4 GREEN `src/server/trpc/router.ts`: extend `adminProcedure` with the D3-F branch (reject unless the called procedure is `admin.rotarContrasena` or `admin.cerrarSesion`)
- [ ] 4.5 GREEN `src/server/trpc/app-router.ts`: `admin.rotarContrasena` â€” `validarContrasenaNueva`, `hashearCredencial`, update `persona`, `revocarSesionesDePersona` except the acting session + reissue, one transaction

## Phase 5: Device lifecycle â€” enrol, present, rotate, revoke (PR 5)

- [ ] 5.1 RED `tests/integration/dispositivo-enrolar.test.ts`: two enrolments produce unrelated tokens; the plaintext token is not present in any later query, only the hash
- [ ] 5.2 GREEN `src/server/auth/dispositivo.ts` (extend): `enrolarDispositivo(db, { nombre, rol })` â€” `token.ts` primitives, `expira_en = now() + 90d`, returns `{ id, token }` once
- [ ] 5.3 GREEN `src/server/trpc/app-router.ts`: `dispositivo.enrolar` (`adminProcedure`)
- [ ] 5.4 RED `tests/integration/dispositivo-presentar.test.ts`: valid credential sets `Set-Cookie: __Host-dispositivo=...; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000`; invalid/wrong credential registers a failure on the `ip` anchor before rejecting; a locked `ip` blocks further `presentar` attempts (ADR-0034 Â§3 backstop)
- [ ] 5.5 GREEN `src/server/trpc/app-router.ts`: `dispositivo.presentar` (public procedure) â€” `estadoBloqueo(ip)` first, `verificarDispositivo`, `cookies.emitir` on `valido`, `registrarFallo(ip)` on any other outcome
- [ ] 5.6 RED `tests/integration/dispositivo-rotar-revocar.test.ts`: rotate issues a new token, previous token rejected on next verification, `id`/`rol` preserved, `rotado_en` stamped; revoke rejects as `revocado`; an unrelated device B still verifies
- [ ] 5.7 GREEN `src/server/auth/dispositivo.ts` (extend): `rotarTokenDispositivo(db, id)`, `revocarDispositivo(db, id)`
- [ ] 5.8 GREEN `src/server/trpc/app-router.ts`: `dispositivo.rotar`, `dispositivo.revocar` (`adminProcedure`)

## Phase 6: Minimal unstyled `/admin` UI (PR 6)

- [ ] 6.1 Rewrite `src/client/pages/Admin.tsx`: state machine login â†’ (rotaciÃ³n forzada | panel), driven by `trpc.admin.*` responses â€” no styling, per proposal's "minimal, unstyled"
- [ ] 6.2 Create `src/client/admin/LoginForm.tsx`: `usuario`+`contrasena` fields, calls `trpc.admin.iniciarSesion`, surfaces the rejected/`bloqueado` reason verbatim
- [ ] 6.3 Create `src/client/admin/RotarContrasenaForm.tsx`: new-password field, calls `trpc.admin.rotarContrasena`, surfaces the SEC-09 rejection reason
- [ ] 6.4 Create `src/client/admin/DispositivosPanel.tsx`: list, enrol (shows the token once, copy affordance), rotate, revoke â€” calls `trpc.dispositivo.*`
- [ ] 6.5 Manual walkthrough (no client test harness decided yet): `npm run migrate && npm run db:seed`, login, forced rotation, enrol at least one device over loopback HTTP, confirm the `Secure` cookie is accepted on `127.0.0.1` (design's open question â€” verified by hand, not by the suite)

## Phase 7: Final verification & propagation confirmation

- [ ] 7.1 `npm run typecheck`
- [ ] 7.2 `npm test` â€” full suite green against real PostgreSQL (ADR-0038), including the `schema-types.test.ts` drift gate
- [ ] 7.3 Confirm `adrs/0043-estado-efimero-de-seguridad-en-postgresql.md` and its `TECH-DESIGN.md` decisions-table row are present as committed in `sdd-design` â€” no new write here
- [ ] 7.4 Confirm the "Mecanismo de arranque, administrador y dispositivo (BACKLOG #3)" `- [ ]` block in `TECH-DESIGN.md` (already propagated in `sdd-spec`) matches shipped behavior; flag any drift instead of silently editing it
- [ ] 7.5 Confirm `BACKLOG.md` rows #5/#24 carry the 1.16 inherited-obligation notes
