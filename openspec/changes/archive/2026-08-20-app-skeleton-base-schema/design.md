# Design: Application Skeleton and Base Schema (`app-skeleton-base-schema`)

BACKLOG item **#1**. Implements the proposal (`proposal.md`, Engram `sdd/app-skeleton-base-schema/proposal`)
plus the four scope decisions the user took after it (Engram `decisions/item-1-scope`).

## Technical Approach

One Node process is the whole deployable. It owns an HTTP listener that, in one ordered pipeline,
guards `Origin`, serves the tRPC API, serves the Vite-built SPA, and falls back to the SPA entry
document so React Router resolves the four routes client-side. PostgreSQL is reached through the raw
`pg` driver; schema history is a directory of numbered SQL files applied by a ~60-line runner. Nothing
in this change knows about the domain: no money is computed, no row is written, no session exists.

**Done = it runs on that topology locally.** No Render service and no Neon database are provisioned
(user decision 1). The Node process behaves identically in both environments because in *neither* does
it terminate TLS — that is the platform edge's job (ADR-0037 §4).

## Runtime Shape — One Origin, One Process

```
                      ┌─ platform edge (prod only) ── terminates TLS, sets X-Forwarded-Proto
                      │        │  cleartext, inside the perimeter
 browser ── HTTPS ────┘        ▼
                      ┌─────────────────────────────────────────────┐
 (dev)   ── HTTP ────►│  Node listener  (binds 127.0.0.1 only)      │
          loopback    │  1. origin guard   POST/PUT/PATCH/DELETE    │
                      │  2. /trpc/*     → tRPC handler (JSON 404)   │
                      │  3. /assets/*   → static, path-traversal    │
                      │                   contained                 │
                      │  4. Accept: text/html → index.html          │
                      │  5. otherwise   → 404                       │
                      └──────────────────┬──────────────────────────┘
                                         ▼  pg pool
                                    PostgreSQL
```

Two orderings are load-bearing and easy to get wrong:

- **The guard is step 1**, before body parsing and before tRPC. It cannot be bypassed by adding a
  procedure, which a tRPC `middleware` on an opt-in base procedure can (see D-A below).
- **`/trpc/*` never falls through to step 4.** An unknown procedure must answer JSON, not the SPA
  document; otherwise the typed client receives HTML where it expects JSON and the failure is
  unreadable. Likewise, a missing hashed asset must 404, not return HTML — hence the `Accept:
  text/html` condition on the fallback rather than a blanket catch-all.

## Migration Mechanism

Plain `.sql` files in `migrations/`, numbered `NNNN_name.sql`, applied in lexicographic order by
`scripts/migrate.ts`. Each file runs inside its own transaction; the runner records the filename in
`schema_migrations (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())` and skips
what is already recorded. Re-running is a no-op.

**Forward-only by construction, not by discipline**: no `down` file exists, so the runner has no verb
to roll back with. This matches ADR-0022's posture and matches the rollback plan already written into
the proposal (while zero rows exist, a migration is *replaced*, not compensated — that freedom ends at
item #3).

| Option | Tradeoff | Decision |
|---|---|---|
| Numbered SQL + tiny runner | ~60 lines to own; no `down` verb to misuse; SQL stays inspectable and reviewable in a git diff | **Chosen** |
| `node-pg-migrate` | Mature, but ships `down` migrations we would have to forbid by convention | Rejected |
| Prisma / Drizzle migrate | Smuggles an ORM decision no ADR has taken, into the first commit | Rejected — see **D-E** |

## Configuration Schema Shape

Three tables, **zero rows**, no `DEFAULT` on any parameter. The absence of defaults is structural
enforcement of the "no invented values" non-goal: item #25 cannot insert a row without supplying every
parameter, so there is no plausible-looking number for anyone to inherit.

```
configuracion_costos          id · vigente_desde · salario_cocina · salario_administrativo
                              costos_indirectos_mensuales · pct_comision · pct_merma · pct_igv
                              creada_por · creada_en           UNIQUE (vigente_desde)

calendario_apertura           id · vigente_desde · abre_lunes … abre_domingo (7 boolean)
                              creada_por · creada_en           UNIQUE (vigente_desde)
calendario_apertura_excepcion calendario_id · fecha (date) · abierto     PK (calendario_id, fecha)

configuracion_operativa       fila_unica boolean PK DEFAULT true CHECK (fila_unica)
                              umbral_demora_min · inactividad_sesion_min
```

| Element | Shape | Why |
|---|---|---|
| `vigente_desde` | `timestamptz NOT NULL`, **no temporal CHECK** | The forward-only rule is item #2's, expressed through `dia_operativo()`. A civil-date CHECK here would be the bare `DATE(timestamp)` ADR-0028 forbids and would be wrong for five hours a day. Safe only because #1 ships no rows and no write path. |
| `UNIQUE (vigente_desde)` | On both versioned tables | "The version in force" = greatest `vigente_desde` ≤ today. Without uniqueness that resolution needs an arbitrary tiebreak. Costs nothing at zero rows; protects item #2. |
| `creada_por` | `integer NOT NULL`, **FK deferred to item #3** | `Persona` does not exist yet. The column stays `NOT NULL` (SEC-08 is not weakened, no synthetic author); item #3 adds `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` when `Persona` lands. **This obligation must be recorded on BACKLOG row #3, exactly as the `vigente_desde` rule was recorded on row #2** — an unrecorded gap here is this project's diagnosed failure mode. |
| Money columns | Integer minor units — **width is open decision D2** | Representation settled (ADR-0011, ADR-0032); literal SQL type is not. Migrations cannot be authored until D2 is answered. |
| Percentages | `integer NOT NULL`, **basis points** (`1800` = 18.00 %) | ADR-0011 covers *importes*, not percentages. A `NUMERIC`/float percentage re-admits binary float into the money path through the multiplication, defeating ADR-0011 at the one step it was written to protect. Needs an acceptance criterion. |
| `excepcion.fecha` | `date` | Not an ADR-0028 violation: this is a *declared* operational day, authored by a human, never derived by truncating an instant. It is compared against `dia_operativo(now())`, never against `DATE(now())`. |
| Primary keys | `integer GENERATED ALWAYS AS IDENTITY` | `node-postgres` returns `int8` as a **string**; an `integer` PK comes back as a JS number. No global `int8` type parser is installed, so if D2 chooses `BIGINT` the string behaviour stays visible instead of being silently coerced. |
| Identifier language | Domain names stay **Spanish**, snake_case (`vigente_desde`), identical DB → TypeScript → client | The 307 acceptance criteria, the data model and all 37 ADRs name these fields in Spanish. Translating them breaks the traceability that is the deliverable. ADR-0002 chose one language precisely so *"un campo que se llama distinto en el backend y en el frontend es un error de dinero silencioso"* — the same argument forbids a DB↔TS renaming layer. English still governs infrastructure code, comments and commits. **Binds all 30 items; warrants an ADR row.** |

## `Origin` Validation

`src/server/http/origin-guard.ts`, mounted as pipeline step 1.

- Applies to every state-changing method (`POST`, `PUT`, `PATCH`, `DELETE`). tRPC sends mutations over
  POST and queries over GET, so this is exactly ADR-0033 §3's *"toda mutación tRPC"*, and it also covers
  any future non-tRPC POST.
- Compares the `Origin` header to `APP_ORIGIN` by **exact string equality** (scheme + host + port). No
  wildcard, no suffix match — a suffix match is how `https://evil-trabajo-restaurant.com` passes.
- **Absent `Origin` on a state-changing request is rejected**, not waved through.
- `403`, no body detail, before body parsing.
- `APP_ORIGIN` is read by `src/server/config/env.ts`, which **throws at boot if unset**. No default
  origin exists; a misconfigured process refuses to start rather than accepting everything.
- SSE (item #4) is a GET and is unaffected.

## The "No Cleartext Port" Integration Test

Non-obvious, so stated explicitly. ADR-0037 §4 reads the ADR-0033 requirement **over the public
interface**; the Node process receives already-decrypted traffic inside the platform perimeter. So the
process legitimately speaks cleartext, and a test that asserts otherwise would assert the opposite of
the architecture. The process owns two halves of the guarantee, and both are locally falsifiable:

| # | Assertion | Mechanism |
|---|---|---|
| 1 | The listener is reachable on **no network** | Start the server; assert `server.address().address === '127.0.0.1'`; open a TCP connection to a non-loopback local IPv4 address on the same port and assert `ECONNREFUSED`. |
| 2 | Cleartext is **rejected, not redirected** | Send a request with `X-Forwarded-Proto: http`; assert status `4xx`, assert status is **not** `3xx`, and assert there is **no** `Location` header. A redirect leaves the first request travelling in cleartext with its cookie inside — precisely what ADR-0033 forbids. |

**Declared residual**: assertion 2 is only meaningful because the platform edge *overwrites*
`X-Forwarded-Proto`. If it merely appended, a client could send `https` and pass. The real rejection of
cleartext at the public origin is the platform's, per ADR-0037 §4, and is not verifiable from this
repository. Stated rather than disguised.

## Decisions Taken Here

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| D-A | `Origin` guard at the **HTTP layer**, one chokepoint | tRPC `middleware` on an opt-in `mutationProcedure`; both layers | An opt-in guard is forgotten by the next procedure — the project's dominant failure mode. Two chokepoints mean two places to forget. |
| D-B | **Vite** builds the SPA; `tsc` builds the server | Bundling the server; a monorepo with workspaces | One package, two build outputs. Nothing here needs workspace boundaries. |
| D-C | SPA fallback conditioned on `Accept: text/html` | Blanket catch-all to `index.html` | A blanket catch-all returns HTML for a missing hashed asset, producing a MIME error instead of a 404. |
| D-D | Static serving resolves against the build root and rejects anything escaping it | Trusting the URL path | Path traversal (`/assets/../../.env`). One RED test. |
| D-E | Raw `pg`, **no ORM/query builder in item #1** | Prisma, Drizzle, Kysely | Item #1 needs a pool and SQL files. But this is a *deferral*, not a settlement: item #7 forces it, because ADR-0003 and ADR-0007 make `SELECT … FOR UPDATE` load-bearing and Prisma reaches it only through raw queries. **Surfaced, not decided — see below.** |

## Open Decisions — NOT Decided Here

These are the user's. `sdd-tasks` **must not** treat any of them as settled, and **D1–D3 block
authoring migrations and tests**: strict TDD means the test precedes the code, and the runner, the money
type and the local transport all sit under that first test.

### D1 — Test runner *(no ADR constrains it; unchosen anywhere in the corpus)*

Strict TDD is active and ADR-0003 makes row-level locking (`SELECT … FOR UPDATE`) load-bearing for FIFO
and concurrency. A mock or an in-memory substitute cannot exhibit a row lock, so the runner must drive
**two real concurrent connections against a real PostgreSQL** — and it must not force per-test
transaction rollback for those cases, because `FOR UPDATE` across two connections needs committed state.

| Option | Real-PostgreSQL integration | One-person fit |
|---|---|---|
| **Vitest** | `globalSetup` migrates a scratch DB once; `pool: 'forks'` gives real process isolation for concurrency tests | Shares the Vite config the SPA already needs — one toolchain, zero transform config for TS/ESM |
| `node:test` | Works, but DB fixtures and lifecycle are hand-rolled | Zero dependencies, yet needs `tsx` for TS and has thin assertion/watch ergonomics |
| Jest | Mature, large DB-fixture ecosystem | ESM+TS friction via `ts-jest`/babel, and a **second** toolchain beside Vite |

**Recommendation: Vitest** — one toolchain with the SPA build, first-class TS/ESM with no transform
config, and `globalSetup` + fork isolation makes the real-PostgreSQL concurrency tests item #7 will need
straightforward from day one. A local PostgreSQL (Docker) becomes a developer prerequisite; ADR-0003
already accepted that cost: *"El proyecto deja de correr con solo clonar el repositorio: necesita Docker
o una instancia gestionada"*.

### D2 — Money SQL column type and width

Representation is settled: integers in minor units (ADR-0011, ADR-0032). No document states the literal
type. ADR-0003's `NUMERIC` mention was a *capability* justifying PostgreSQL, not a mandated column type
— it is not a contradiction.

| Option | Consequence |
|---|---|
| **`INTEGER`** | Max `2 147 483 647` céntimos = **S/ 21 474 836.47** per stored value. The values here are one restaurant's monthly indirect costs and flat salaries — three to four orders of magnitude below that. `SUM(integer)` in PostgreSQL already widens to `bigint`, so aggregation cannot overflow. `pg` returns it as a JS number, safe under 2⁵³. |
| `BIGINT` | Headroom nobody needs, at a real cost: `node-postgres` returns `int8` as a **string**, so `a + b` silently concatenates. Avoiding that needs a global type-parser override, which then hides genuine `int8` columns too. |

**Recommendation: `INTEGER`.** The cost of being wrong is small and bounded — `ALTER TABLE … ALTER
COLUMN … TYPE bigint` on a few thousand rows is a table rewrite measured in milliseconds. The cost of
`BIGINT` is a string-vs-number hazard on every money field, in a project whose stated failure mode is a
plausible number that does not reconcile.

### D3 — Local development without platform TLS

ADR-0033 forbids cleartext; ADR-0037 §4 reads that over the *public* interface. A developer machine is
unstated everywhere.

| Option | Makes verifiable | Does **not** make verifiable |
|---|---|---|
| **(a) Plain HTTP bound to loopback** | Every item-#1 criterion: single origin, four routes, tRPC round-trip, `Origin` rejection, migrations, loopback-only bind, no-redirect on `X-Forwarded-Proto`. Identical process shape to production (the process terminates TLS in neither). | `Secure`/`SameSite` cookie behaviour in **Safari** (Chrome/Firefox treat `http://localhost` as a secure context and do set `Secure` cookies). Item #1 ships no cookies, so this belongs to items #3/#5. |
| (b) Local dev certificate (mkcert) | Additionally: `Secure` cookies in every browser | Reintroduces a local CA, trust-store install and key custody — **exactly what ADR-0037 deleted**, and it changes the process shape (the app terminates TLS, production's does not). |
| (c) Local reverse proxy (Caddy) terminating TLS | The most faithful topology reproduction, including a real `X-Forwarded-Proto` | Same local-CA cost as (b), plus a second moving part in every developer's setup. |

**Recommendation: (a).** It keeps the process shape identical to production, makes every acceptance
criterion of *this* item verifiable, and adds no CA. The gap is one criterion that item #1 does not own:
**record on BACKLOG rows #3/#5 that ADR-0033 §2 cookie attributes are not verifiable under local plain
HTTP on all browsers** — same inheritance discipline as `vigente_desde` on row #2.

### D-E (surfaced, outside the orchestrator's list) — data-access layer

Item #1 only needs a pool and SQL files, so "raw `pg`, no ORM" is a safe *deferral*. But whoever writes
the first query settles it silently, and by item #7 it is load-bearing (`SELECT … FOR UPDATE`, ADR-0003 /
ADR-0007). Flagged now so the decision is taken deliberately rather than inherited.

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json`, `tsconfig*.json`, `.gitignore`, `vite.config.ts` | Create | Repository baseline; none exist |
| `src/server/index.ts` | Create | Listener, pipeline wiring, loopback bind |
| `src/server/config/env.ts` | Create | Required env (`APP_ORIGIN`, `DATABASE_URL`); throws at boot |
| `src/server/http/origin-guard.ts` | Create | Pipeline step 1 |
| `src/server/http/static.ts` | Create | Static serving, traversal containment, HTML fallback |
| `src/server/trpc/{context,router,app-router}.ts` | Create | tRPC init + one throwaway query and one throwaway mutation |
| `src/server/db/pool.ts` | Create | `pg` pool |
| `src/client/{main.tsx,routes.tsx,trpc.ts}`, `src/client/pages/*.tsx` | Create | SPA, four placeholder routes, typed client |
| `migrations/0001_configuracion.sql` | Create | The three tables + `schema_migrations` (blocked on D2) |
| `scripts/migrate.ts` | Create | Forward-only runner |
| `tests/**` | Create | Blocked on D1 |
| `TECH-DESIGN.md` | Modify | New skeleton criteria as `- [ ]` checkboxes (Spanish) — owned by `sdd-spec` |
| `BACKLOG.md` rows #3, #5 | Modify | Record the two inherited obligations named above |

**Not touched by this phase**: `adrs/` and the `TECH-DESIGN.md` decisions table. Every decision above
that needs an ADR is listed for the orchestrator's decision round; this agent wrote none.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Origin-guard predicate (match / foreign / absent / suffix-lookalike); env loader throws on missing var; migration ordering + already-applied skip; static path containment | Pure functions, no DB, no socket |
| Integration | Migrations against a real PostgreSQL: fresh DB → three tables, **zero rows**, second run is a no-op; tRPC round-trip over real HTTP with inferred types; foreign-`Origin` mutation rejected `403`; the two "no cleartext" assertions | Real server on an ephemeral port, real `pg` connection |
| Route rendering | Each of `/estacion`, `/kds`, `/cocina`, `/admin` returns the SPA entry document with `200`; `/trpc/nope` returns JSON, not HTML | HTTP-level, **no browser driver** — there is no domain UI to drive yet, so no E2E tool is chosen here; that decision belongs to the first item with real screens |

## Threat Matrix

Not applicable. This change has no shell command, subprocess, VCS/PR automation, executable-file
classification or agent-process integration boundary.

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A — no file classification or execution |
| Git repository selection | N/A — no VCS invocation |
| Commit state | N/A — no index/worktree manipulation |
| Push state | N/A — no push |
| PR commands | N/A — no PR automation |

The change's real adversarial boundaries are HTTP-layer and are covered above as design requirements
with RED tests: `Origin` forgery (guard, exact match, absent-header rejection), static path traversal
(D-D), and cleartext handling (the two assertions).

## Migration / Rollout

No data migration: the tables are new and empty. Rollout is the proposal's plan unchanged — while zero
rows exist, a migration file is replaced wholesale rather than compensated, and that freedom ends when
item #3 inserts the first row.

## Open Questions

- [ ] **D1** Test runner — recommendation: Vitest. Blocks every test file.
- [ ] **D2** Money column type — recommendation: `INTEGER`. Blocks `migrations/0001_configuracion.sql`.
- [ ] **D3** Local transport — recommendation: plain HTTP on loopback. Blocks the integration harness.
- [ ] **D-E** Data-access layer — deferred safely for #1; forced by #7.
- [ ] Identifier-language convention (Spanish domain names, identical DB→TS) binds all 30 items and
      warrants an ADR row.
- [ ] Percentages as integer basis points needs an acceptance criterion, or float re-enters the money path.
