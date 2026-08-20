# Exploration: BACKLOG #2 — Núcleo de exactitud (exactness-core)

## Current State

### Codebase (post item #1, merged commit 3ea1d54)

Real source lives under `src/`, not `prototypes/` (bundle, no authority). Structure:

- `src/server/db/pool.ts` — raw `pg` `Pool` factory, throws loudly if `DATABASE_URL` unset. No query
  builder, no ORM in `node_modules` (checked: no `kysely`, `prisma`, `drizzle-orm`, `drizzle-kit`).
- `src/server/trpc/context.ts` — **deliberately empty** (`Record<string, never>`). Comment: *"No domain
  context yet — the data-access layer (design D-E) is deliberately deferred past item #1"*. This is the
  file item #2 unblocks: any domain query needs `pool`/a client reachable from tRPC context.
- `src/server/trpc/{router,app-router}.ts` — tRPC init only, one throwaway query/mutation, no domain
  procedures yet.
- `migrations/0001_configuracion.sql` — creates `configuracion_costos`, `calendario_apertura`,
  `calendario_apertura_excepcion`, `configuracion_operativa`. **Zero rows, zero DEFAULTs.**
  `vigente_desde timestamptz NOT NULL` with **no CHECK** (explicit debt, see below). `creada_por
  integer NOT NULL` with **no FK** (Persona doesn't exist until #3). `UNIQUE (vigente_desde)` already
  present on both versioned tables — this removes tie-break ambiguity for vigencia resolution ("version
  in force = greatest `vigente_desde` ≤ today" needs no arbitrary tiebreak).
- `scripts/migrate.ts` — ~60-line forward-only runner, numbered files, own transaction per file,
  `schema_migrations` bookkeeping table. No `down`. Item #2 adds `migrations/0002_*.sql`.
- `tests/{unit,integration}/**` — Vitest (ADR-0038). Integration tests run against real PostgreSQL via
  `tests/setup/global-setup.ts`. Money/FIFO/concurrency tests MUST use this tier, never a mock.
- Confirmed `pg`, `zod`, `@trpc/*`, `vitest`, `react`/`react-router` installed via `node_modules`.

### What item #1 explicitly deferred to item #2 (its own design doc, decision D-E and Open Question D-E)

> "Item #1 only needs a pool and SQL files, so 'raw `pg`, no ORM' is a safe *deferral*. But whoever
> writes the first query settles it silently... Flagged now so the decision is taken deliberately rather
> than inherited."

Archive report confirms: *"Task 0.1 (data-access layer decision) DEFERRED to BACKLOG item #2 by user
decision, recorded as entry gate on BACKLOG row #2."* Item #1's own design doc originally guessed item #7
(FIFO) would force the decision; the user overrode that and pulled it forward to #2 — consistent with
BACKLOG's framing that vigencia resolution is "the first domain query of the project."

### ADR states relevant to this item (all current, none superseded for this scope)

| ADR | Estado | What it fixes for item #2 |
|---|---|---|
| ADR-0011 | Aceptado, completado por 0032 | Money is integer minor units, no float. Sets ceiling; 0032 fills the "what happens to fractions" gap. |
| ADR-0032 | Aceptado, cierra hallazgo #9 | **The** rounding ADR: one function (half-up to the cent), two families — Reparto (truncate + residue-by-order) vs Porcentaje (round at the finest persisted row, sum upward, never re-round an aggregate). No unit insumo cost persisted. |
| ADR-0039 | Aceptado, completa 0011 y 0032 | Literal SQL types: `integer` for money, `integer` basis points for percentages (18% = `1800`). Bound-parameter mandate for every money/percentage write — a literal fractional SQL value against an `integer` column silently rounds with Postgres's *own* rule, not ADR-0032's. |
| ADR-0022 | Aceptado, precisado por 0028 | `vigente_desde >= fecha actual`, no retroactive vigencia — stability of historical reports depends on this holding structurally. |
| ADR-0028 | Aceptado, cierra hallazgo #3 | Defines `dia_operativo()`: `DATE((instante AT TIME ZONE 'America/Lima') - INTERVAL '5 hours')`. A **constant**, not a parameter (changing it re-groups reported history). Explicitly: *"vive en un solo lugar de la base"* — textual signal this should be a real Postgres function, not a TS-only reimplementation at each call site. Corrects ADR-0022's "fecha actual" to mean *operational* day, not server civil date. |
| ADR-0040 | Aceptado, precisa idioma | Domain identifiers (tables, columns, tRPC field/enum names) are Spanish, snake_case, identical DB↔backend↔client. Governs naming of anything item #2 exposes across that boundary (not internal helper names). |
| ADR-0013 | Aceptado | Server is sole source of truth; client caches queries, no domain store. Frontend-facing, not a hard backend constraint — but its reasoning ("a second source of truth is a silent bug in a money system") is the same shape of argument worth weighing if any candidate data-access layer's request-scoped caching/identity-map behavior could look like a second source of truth on the backend. Noted as a soft analogy, not a violation by default. |
| ADR-0003, ADR-0007, ADR-0030 | Aceptado (0007 completado por 0030) | Not item #2's to implement, but constrain the data-access-layer choice: `SELECT ... FOR UPDATE` over FIFO lots, locked in insumo-id order to avoid deadlock, ordered by `numero_lote` alone (not date). Whatever layer #2 selects must make this pattern natural for item #9, or #9 inherits an awkward escape hatch. |

### Acceptance criteria already in TECH-DESIGN.md that this item owns (verbatim, not paraphrased)

**Redondeo y exactitud monetaria (ADR-0032)** — lines 778–790. Item #2 owns building and unit-testing the
two **generic primitives** to acceptance grade now (no consuming entity needed to prove these in
isolation):
- "La función de redondeo es una sola en todo el sistema: al céntimo más cercano, medio hacia arriba."
- "Reparto (hay un total que respetar): se trunca cada parte, y el residuo se asigna de a un céntimo en
  orden determinista hasta agotarlo. La suma de las partes da el total, diferencia 0, por construcción."
- "Porcentaje (no hay total que respetar): se aplica medio-arriba en la fila más fina donde el importe se
  persiste, y todo nivel superior es una suma de esos enteros. Ningún reporte recalcula un porcentaje
  sobre un agregado."
- (line 437, in the Tipos section) "Aplicar un porcentaje no introduce un segundo redondeo: la división
  por 10 000 ocurre dentro de la única función de redondeo, en su único punto de aplicación."

The criteria that name a *specific* reparto/porcentaje consumer (combo split order, lot-closing absorption,
monthly-fixed-cost proration order, IGV per `ItemVenta`, commission per `Venta`, merma estimada exclusion,
`Compra.costo_costeado_total` timing — lines 782, 784–790) belong to the items that own those entities
(#8, #9, #19, #25, #28). Item #2 must build the primitives generic enough (parameterized comparator/order,
not hardcoded to any one entity) for those items to compose without touching the primitive itself.

**Día operativo (ADR-0028)** — lines 813–823. Item #2 owns building `dia_operativo()` and can fully close,
right now, the criteria that are pure-function properties independent of any consuming entity:
- Sample computations (sáb 23:40 → sábado; dom 00:30 → sábado; dom 05:01 → domingo) — line 815.
- Partition invariant: every instant maps to exactly one day, no gaps/overlaps — line 820.
- Month-as-set-of-days edge case (Jan ends Feb 1 04:59) — line 821.
- Axis is 05:00–04:59, not 00:00–23:59 — line 822.
- **`vigente_desde` compared against the current operational day, not server civil date — line 823. This
  is the literal inherited debt from #1.**

Criteria naming specific consumers (Turno/ServicioCocina/CalendarioApertura/estado de resultados/analítica
all sharing the function — line 816; ServicioCocina spanning midnight as one row — line 818; Turno reopen
after midnight — line 819; CalendarioApertura's `patron_semanal` read over operational days — line 817)
can only be **fully** closed once those entities exist (#6, #11, #21, #25, #28). Item #2 must not create a
second, competing day-boundary calculation for any of them to inherit.

**Tipos / bound parameters** — lines 436–440 (already-existing criteria, not new): integer money/basis-
point percentages, no float; bound-parameter-only writes for money/percentage (this is also literally the
lesson item #1's own post-verify finding added to BACKLOG row #25 — "toda escritura de dinero o
porcentaje va por parámetro enlazado" — and it is exactly the property whichever data-access layer #2
picks must make easy to get right and hard to get wrong, since raw string-interpolated SQL against an
`integer` column silently rounds using Postgres's own rule, not ADR-0032's).

### Content gap found (not previously flagged anywhere read)

No document — not `TECH-DESIGN.md`, not ADR-0021/0022/0028/0032 — writes the **vigencia resolution
algorithm** as an explicit formula or checkbox. It is only inferable from item #1's own design.md prose
("the version in force = greatest `vigente_desde` ≤ today; the `UNIQUE (vigente_desde)` constraint exists
to remove the tiebreak"). Given this project's own diagnosed failure mode — *"no es decidir mal, es no
propagar lo decidido"* — sdd-propose/sdd-spec should write this algorithm explicitly into `TECH-DESIGN.md`
as new criteria under a "Resolución de vigencias" heading, not leave it implicit.

### Inherited-obligation boundary confirmed against BACKLOG #25 (checked, not assumed)

BACKLOG row #25 owns the **0..10000 basis-points range CHECK** for percentage columns ("el rechazo de
valores fuera de 0..10000 puntos básicos (ADR-0039) se implementa acá, donde nace la primera escritura").
That is **not** item #2's scope — item #2 does not touch percentage-range validation. Confirmed no basis-
points CHECK exists anywhere in the current schema (grep of `migrations/` found none), consistent with
this boundary.

One genuine ambiguity worth surfacing to sdd-propose rather than silently resolving: BACKLOG row #3 says
item #3 writes "las filas semilla de las entidades de configuración... cuyo `creada_por` apunta a ese
administrador," which reads as item #3 inserting rows into `configuracion_costos`/`calendario_apertura`.
BACKLOG row #25 separately says the pct-range CHECK "se implementa acá, **donde nace la primera
escritura**" for those same columns — which reads as item #25 being the first real INSERT. These two
statements are hard to both be literally true for the same tables. It does not block item #2's work (item
#2 can and should write its own direct test-only INSERTs against `configuracion_costos`/
`calendario_apertura` to prove the temporal CHECK and the vigencia-resolution query, independent of which
later item performs the first *production* write — `creada_por` has no FK yet, so a test row can use any
integer). But it should be resolved or at least noted before #3/#25 are opened, so neither silently
assumes the other already seeded rows. Separately, the "Decisiones de despiece" section at the bottom of
BACKLOG.md still says configuration entities "nacen sembradas en #1," which is now stale against the
current row #1/#3 text (seeds explicitly moved to #3) — a documentation staleness, not a blocker.

## Affected Areas

- `migrations/0002_*.sql` (new) — `dia_operativo(timestamptz) RETURNS date` as a Postgres function (the
  "vive en un solo lugar de la base" mandate reads as SQL-level, not TS-only); the temporal CHECK/trigger
  on `vigente_desde` for both `configuracion_costos` and `calendario_apertura`, built on that function.
- `src/server/trpc/context.ts` — currently intentionally empty specifically because this item wasn't done
  yet; item #2 is where that placeholder's premise ends. It will need to carry whatever handle (`pg.Pool`,
  a query-builder instance, or an ORM client) the data-access-layer ADR selects.
- New domain module (path TBD by design phase) for the two rounding primitives — likely pure TypeScript,
  no DB dependency, English helper names per ADR-0040 ("todo lo demás sigue en inglés" — these are not
  TECH-DESIGN-named entities/fields).
- New domain module for vigencia resolution — the first real domain query, exercising whichever
  data-access layer gets chosen; needs `configuracion_costos`/`calendario_apertura` present (already are,
  from #1).
- `tests/unit/*` — pure rounding/reparto function tests, no DB.
- `tests/integration/*` — `dia_operativo()` test-vector suite against real Postgres (sample computations,
  partition invariant, axis boundary), temporal-CHECK rejection test (insert past `vigente_desde` →
  expect DB-level rejection, not just app-level), vigencia-resolution query test.
- `adrs/00XX-*.md` (new) — the data-access-layer ADR itself, plus its row in `TECH-DESIGN.md`'s
  "Decisiones de arquitectura" table (append-only convention, ADRs never rewritten).
- `TECH-DESIGN.md` — likely a new "Resolución de vigencias" criteria subsection (content gap above); no
  changes needed to the already-existing 780–790/813–823/436–440 blocks themselves, only their
  implementation.
- Not affected: `configuracion_operativa` (no `vigente_desde`, no money/percentage relevant to this item);
  the 0..10000 basis-points CHECK (confirmed BACKLOG #25's, not #2's).

## Approaches — data-access layer for domain queries (the ADR this item is the entry gate for)

Framed against this project's specific pressure points: money as bound-parameter integers (ADR-0039),
`SELECT ... FOR UPDATE` over FIFO lots in deterministic insumo-id order (ADR-0007/0030, load-bearing by
#9), Spanish snake_case identifiers identical DB↔backend↔client (ADR-0040), the existing hand-rolled
forward-only SQL migration runner from #1 (which already rejected `node-pg-migrate`/Prisma/Drizzle-migrate
specifically to avoid a second migration mechanism), and the project's repeated "one-person team" cost
argument (already used to pick Vitest over Jest, `INTEGER` over `BIGINT`, plain HTTP over mkcert in #1).

1. **Raw `pg` (status quo, formalized)** — continue what #1 already has: hand-written parameterized SQL
   strings, `pool.query(text, params)`, typed manually or via lightly-generated row types.
   - Pros: zero new dependency; nothing to learn beyond what #1 already uses; `SELECT ... FOR UPDATE` and
     any Postgres-specific clause is just SQL, no escape hatch needed; column names come back exactly as
     Postgres returns them (snake_case) — ADR-0040 compliance is free, not enforced by convention; no
     migration-tool conflict with the existing runner (there is no separate tool to conflict).
   - Cons: no compile-time check that a hand-written query's shape matches the table it targets — a typo
     in a column name is a runtime error, not a build error; result-row types are hand-maintained and can
     drift from the schema silently, which is exactly this project's diagnosed failure mode ("un número
     plausible que no reconcilia") applied to types instead of money; every domain query duplicates
     boilerplate (`client.query<T>(...)`, param arrays) that grows linearly with the number of queries
     across 20+ remaining items.
   - Effort: Low (nothing new to introduce now); rising maintenance cost as query count grows through the
     rest of the backlog.

2. **Query builder (Kysely)** — a typed SQL builder, not an ORM: generates the same SQL raw `pg` would
   send, but with compile-time column/table name checking against a generated types file, and typed
   `.forUpdate()` / `.orderBy()` chains that stay close to the literal SQL.
   - Pros: catches a renamed/typo'd column at compile time (directly serves ADR-0040's "identical DB↔TS"
     guarantee, mechanically rather than by discipline); `SELECT ... FOR UPDATE` is a first-class,
     typed builder method, not a raw-SQL escape hatch — fits #9's FIFO lock pattern directly; no
     independent migration engine to conflict with #1's runner (types are generated *from* the existing
     schema via a codegen step, migrations stay exactly as they are); snake_case column names pass through
     unless explicitly aliased, so ADR-0040 needs no mapping layer.
   - Cons: adds a dependency and a codegen step (regenerate types after every migration) that must be
     wired into the dev workflow and kept from going stale; smaller ecosystem/hiring pool than Prisma;
     still requires understanding SQL semantics (not a drawback for this team given the project's own SQL-
     literacy assumptions elsewhere, but worth naming).
   - Effort: Medium — one dependency, one codegen wiring step, otherwise close to option 1's mental model.

3. **Full ORM (Prisma as the concrete example)** — a schema-first client with its own migration engine,
   generated model types, and query API.
   - Pros: highest-level API, fastest to write simple CRUD; large ecosystem and docs.
   - Cons: Prisma's own migration workflow (`prisma migrate`) is a second migration mechanism sitting next
     to the hand-rolled runner #1 deliberately chose (#1's design doc explicitly rejected Prisma/Drizzle
     migrate for exactly this reason) — using Prisma Client without its migrations means fighting the
     tool's default workflow (introspection via `prisma db pull` after every hand-written migration, kept
     manually in sync, itself a drift risk); Prisma's client field-naming convention defaults to camelCase
     unless every field is explicitly `@map`-annotated to the snake_case column name, which is exactly the
     kind of per-field discipline ADR-0040 exists to avoid needing; historically thin native support for
     `SELECT ... FOR UPDATE` row locking (typically requires dropping to `$queryRaw`), which undercuts the
     ORM's value proposition on precisely the hot path (#9's FIFO consume) this decision has to serve well.
   - Effort: Medium-High — the friction is not initial setup, it is the number of places (migrations,
     field naming, row locking) where the tool's defaults actively fight this project's already-decided
     constraints, each needing a documented workaround.

A fourth shape worth naming without expanding to a full option: **Drizzle** is dual-natured — it can be
used purely as a typed query builder close to option 2 (own migration tool skippable, schema defined by
hand to match existing snake_case columns, native `.for('update')` support), which would land it much
closer to option 2's tradeoffs than option 3's. Whether it is evaluated as its own line or folded into the
query-builder option is a call for sdd-propose, not this exploration.

## Recommendation

Not mine to make — the data-access-layer choice is explicitly named as this item's own ADR in BACKLOG row
#2, and the task instructions for this exploration are explicit that deciding it is out of scope here.
What this exploration surfaces for that decision: the two hard constraints this project has already
committed to (`SELECT ... FOR UPDATE` in deterministic order for FIFO, and Spanish snake_case identifiers
identical DB↔backend↔client) both favor an approach that stays close to literal SQL rather than one that
abstracts it away, and the existing migration runner from #1 already rejected any tool that brings its own
migration engine. That is evidence to weigh, not a decision made here.

For the parts of this item that are **not** the ADR — the rounding primitives, `dia_operativo()`, and the
temporal CHECK on `vigente_desde` — those are already fully specified by ADR-0032/ADR-0028 and existing
TECH-DESIGN criteria (780–790, 813–823). They do not depend on which data-access layer wins: the rounding
primitives are dependency-free TypeScript, `dia_operativo()` is a Postgres function regardless of how it
gets called, and the temporal CHECK is DB-level regardless of what issues the `ALTER TABLE`. sdd-propose
can scope those independently of the ADR debate, and only the "resolución de vigencias" query itself
(the one piece of domain-query code this item actually ships) needs the ADR resolved first.

## Risks

- The data-access-layer choice, once made, is load-bearing for the rest of the backlog (#9's FIFO lock
  pattern especially) — a wrong-for-the-hot-path choice here is expensive to reverse after #7–#9 are built
  on top of it.
- The vigencia-resolution algorithm has no explicit written formula anywhere today (content gap above);
  if sdd-spec implements it without first writing the formula into `TECH-DESIGN.md`, the project repeats
  its own diagnosed failure mode on a new decision.
- The row #3 vs row #25 ambiguity about who performs the first real INSERT into
  `configuracion_costos`/`calendario_apertura` should be resolved or flagged before those items open, so
  neither silently assumes work the other was supposed to do.
- A `CHECK` constraint (or trigger) comparing `vigente_desde` against `dia_operativo(now())` uses a
  non-immutable function inside a constraint; Postgres allows this for at-write-time enforcement (which is
  exactly the semantics wanted — old rows are not retroactively invalidated as time passes), but the exact
  mechanism (plain `CHECK` vs `BEFORE INSERT/UPDATE` trigger) and any edge-case behavior under
  dump/restore or constraint validation should be confirmed during design/apply rather than assumed here.
- BACKLOG.md's "Decisiones de despiece" section is stale relative to rows #1/#3 on where configuration
  seeds land — low-risk documentation drift, worth a small fix whenever #3 or #25 is opened.

## Ready for Proposal

Yes. The scope is well-bounded by existing TECH-DESIGN criteria and ADRs for everything except the
data-access-layer ADR itself, which is correctly flagged as this item's own decision to take in
sdd-propose/sdd-design, not before. Recommend sdd-propose present the three (or four, including Drizzle)
data-access options above as the explicit decision point, alongside the already-specified rounding/
dia_operativo/vigencia-CHECK work as the non-debated remainder of scope.
