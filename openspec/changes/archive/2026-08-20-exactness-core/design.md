# Design: Exactness core (`exactness-core`)

`BACKLOG.md` item **#2** (*Núcleo de exactitud*). Implements `proposal.md` (Engram
`sdd/exactness-core/proposal`), which already picked **Kysely** as the data-access layer (ADR-0042).
This document decides *how*, and closes the two questions the proposal deferred to this phase: **the
mechanism for the temporal rule** (P1) and **the freshness of the generated types** (P2).

## Technical Approach

Three pieces, each one resting on a single point:

1. **Rounding** — a pure module, no database and no network, with **one** rounding function
   (`redondear`) and the two ADR-0032 families built on top of it. Arithmetic in `bigint`; a float
   **does not compile**.
2. **Operational day and temporal rule** — `dia_operativo()` lives exactly once, in the database
   (`migrations/0002_*.sql`), and the ban on a retroactive `vigente_desde` is enforced with a
   **`BEFORE` trigger**, not with a `CHECK` (P1, below).
3. **Data access** — a `Kysely<DB>` built on the `pg.Pool` that already exists
   (`src/server/db/pool.ts`), exposed through the tRPC context, with types **generated from the
   migrated database** and a golden test that keeps them from going stale (P2, below).

Implementation order is the proposal's: (1) is independent of everything; (2) does not depend on
Kysely; (3) consumes (2).

## P1 — `BEFORE` trigger, not `CHECK`

**Decision: `CREATE TRIGGER ... BEFORE INSERT OR UPDATE OF vigente_desde ... FOR EACH ROW`.**

PostgreSQL **does accept** a non-immutable function inside a `CHECK` (`now()` is `STABLE`) and
evaluates it on every write, so under normal use both options behave identically. The difference
shows up when something **re-evaluates the predicate over rows that were already written**, and there
the `CHECK` is a time bomb:

| Re-evaluation moment | `CHECK` with `now()` | `BEFORE` trigger |
|---|---|---|
| `pg_dump` → `pg_restore` | **Breaks.** A validated `CHECK` is emitted *inline* in the `CREATE TABLE` (**pre-data** section) and is evaluated row by row during the `COPY`. Every historical effective row — valid the day it was written — is in the past today: the restore **fails**. | **Safe.** `CREATE TRIGGER` goes in the **post-data** section, i.e. *after* the `COPY`. The load does not fire it. |
| Table rewrite (`ALTER COLUMN ... TYPE bigint`) | **Breaks**, for the same reason. And that rewrite is exactly the cheap escape hatch item #1's design left on record in case `INTEGER` turns out too small (D2). | Does not fire on a rewrite. |
| `UPDATE` of another column on an old row | **Breaks**: the `CHECK` re-evaluates the whole row's predicate. Item #3 is going to touch these tables (FK on `creada_por`). | Does not fire: `UPDATE OF vigente_desde` plus the `IS NOT DISTINCT FROM` guard. |

That turns the rule into what ADR-0022 actually wants: **"you cannot *write* an effective date
backwards"**, not *"every row must be perpetually in the future"*. A row that was valid when it was
written stays valid forever.

**Rejected alternatives.** `CHECK ... NOT VALID` would restore fine (it lands in post-data), but its
placement is a side effect of the flag: a single `VALIDATE CONSTRAINT` silently re-arms it, and it
still re-evaluates on every `UPDATE`. Validating only in the application contradicts the proposal's
success criterion ("the database rejects it, not the app") and TECH-DESIGN criterion 411.

**Error wrapping.** The trigger raises `ERRCODE = '23514'` (`check_violation`) and
`CONSTRAINT = 'vigente_desde_no_retroactiva'`, so `node-postgres` hands back `error.code` and
`error.constraint` **identical** to those of a real `CHECK`: the mapping to a domain error does not
know — and does not care — which mechanism produced it, and swapping mechanisms does not break the
caller.

### `migrations/0002_dia_operativo_y_vigencia.sql` (design level)

```sql
CREATE FUNCTION dia_operativo(instante timestamptz) RETURNS date
  LANGUAGE sql STABLE STRICT PARALLEL SAFE AS $$
  SELECT ((instante AT TIME ZONE 'America/Lima') - INTERVAL '5 hours')::date;
$$;

CREATE FUNCTION vigencia_no_retroactiva() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.vigente_desde IS NOT DISTINCT FROM OLD.vigente_desde THEN
    RETURN NEW;
  END IF;
  IF dia_operativo(NEW.vigente_desde) < dia_operativo(now()) THEN
    RAISE EXCEPTION 'vigente_desde % precedes the current operational day %',
      dia_operativo(NEW.vigente_desde), dia_operativo(now())
      USING ERRCODE = '23514', CONSTRAINT = 'vigente_desde_no_retroactiva';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER vigente_desde_no_retroactiva
  BEFORE INSERT OR UPDATE OF vigente_desde ON configuracion_costos
  FOR EACH ROW EXECUTE FUNCTION vigencia_no_retroactiva();
-- same on calendario_apertura (one function, two triggers)
```

- **`STABLE`, not `IMMUTABLE`.** `timestamptz AT TIME ZONE <text>` is `STABLE` in PostgreSQL (zone
  rules can change with the tzdata). Declaring it `IMMUTABLE` would be a lie, and it would enable
  indexes and generated columns that would end up silently wrong — exactly what ADR-0028 forbids when
  it says *it is never persisted*. Accepted consequence: **there is no index on
  `dia_operativo(vigente_desde)`**; these are a handful of rows per year.
- **One function, two triggers.** Nothing duplicates the 05:00 cutoff.
- **Both tables are empty** (item #1 inserted no rows), so creating the trigger needs no backfill. The
  runner wraps each file in its own transaction and PostgreSQL DDL is transactional: a half-applied
  `0002` does not exist.
- `calendario_apertura_excepcion.fecha` gets **no** trigger: it is a declared day, hanging off the
  effective period of its parent calendar.
- The comparison is `dia_operativo(vigente_desde) < dia_operativo(now())`, never `::date` and never
  `CURRENT_DATE`: between 00:00 and 04:59 Lima time the two answers differ, and that is exactly where
  it fails silently.

### Write path

```
INSERT/UPDATE ─► BEFORE trigger ─► dia_operativo(NEW.vigente_desde) < dia_operativo(now()) ?
                                     │ yes                       │ no
                                     ▼                           ▼
                        23514 / vigente_desde_no_retroactiva    RETURN NEW
                                     │
                        pg error {code, constraint} ─► domain error ─► Spanish message (UI)
```

## P2 — Generated types cannot go stale

**Decision: `kysely-codegen` + a committed file + a golden test inside `npm test`.**

| Piece | What |
|---|---|
| Generator | `kysely-codegen --dialect postgres --out-file src/server/db/schema.d.ts` (no `--camel-case`: identifiers stay `snake_case` in Spanish, ADR-0040) |
| Command | `npm run db:types` — **the only** one that writes that file, and it reads `DATABASE_URL` |
| File | `src/server/db/schema.d.ts`, **committed**. `.d.ts` because it cannot contain runtime code: it cannot become a second source of truth |
| Gate | `tests/integration/schema-types.test.ts`: regenerates **into a temporary file** from `TEST_DATABASE_URL` (already migrated by `globalSetup`) and compares against the committed one. If they differ, it fails naming `npm run db:types` |

Why this makes drift **impossible to merge** and not merely visible: the gate runs on every `npm test`,
which is the only gate this project has (there is no CI and none will be added: academic project,
ADR-0037). A migration that adds a column and does not regenerate types **turns the suite red**, and
the `sdd-verify` phase sees that red before any merge.

Two traps this design avoids on purpose:

- **Nothing regenerates the committed file during the test run.** No `postmigrate` hook:
  `tests/setup/global-setup.ts` invokes `npm run migrate`, so a `postmigrate` would regenerate the
  file from the test database **before** the comparison, and the gate would be dead forever, green by
  construction. The test writes to a temporary file and never to the source tree.
- **The comparison normalizes line endings** (`\r\n` → `\n`) before comparing: on Windows with
  `core.autocrlf` the committed file is read as CRLF while the generated one comes back as LF, and a
  false red teaches people to ignore the gate.

**Rejected alternative: do not commit the types and generate them in `prepare`/`pretest`.** Drift
would be literally impossible, but `npm run typecheck` would start requiring a live database, a fresh
clone would not compile, the schema change would stop being readable in the diff — which is half the
reason this project keeps the git mirror — and an out-of-date local database would generate types
consistent with an old schema: the same drift, now without a witness.

## Decisions made here

| # | Decision | Rejected alternatives | Rationale |
|---|---|---|---|
| D2-A | Temporal rule via **`BEFORE` trigger** | `CHECK` with `now()`; `CHECK NOT VALID`; app-only validation | Restore and table rewrite do not re-evaluate a trigger; the rule is about the *write*, not about the row |
| D2-B | `dia_operativo()` is **`STABLE`** | `IMMUTABLE` | Zone conversion by name is not immutable; lying would enable silently incorrect indexes and generated columns |
| D2-C | `redondear(numerador: bigint, denominador: bigint)` — **takes an exact rational** | Taking an already-divided `number` | The division happens *inside* the single rounding point (TECH-DESIGN 437). With `bigint` a float does not even typecheck, and `BigInt(1.5)` **throws** at the boundary |
| D2-D | Half-up, **symmetric around zero** | Half toward `+∞` | `redondear(-n,d) === -redondear(n,d)`: negating an amount is exact. And it is what a human verifying by hand does (ADR-0032 chose half-up precisely for manual verifiability) |
| D2-E | `reparto` requires a **total comparator** and **throws** if it returns 0 between distinct parts | Falling back to input order (stable `sort`) | A silent tie moves a cent somewhere else with nothing raising a flag |
| D2-F | Kysely **reuses the `pg.Pool`** from `createPool()`; it does not create its own | `PostgresDialect` with its own pool | One source of connection configuration and one teardown (`db.destroy()`) |
| D2-G | `ServerConfig` and the context carry `db` as **required** | Optional `db` | An optional handle lets you write procedures against a database that may not be there. From item #2 onward, the process means nothing without a database |
| D2-H | Effective-period resolution returns a **discriminated union**, not `undefined` | `T \| undefined` | `?? 0` is exactly *"a profit figure with a zero inside it"* (TECH-DESIGN 833). The union forces you to branch |
| D2-I | Names `redondear` / `reparto` / `porcentaje` in **Spanish** | English names | TECH-DESIGN 786 literally writes `redondear(...)`, and 781/783 name the two families. The ADR-0040 rule is *"if the name appears in an acceptance criterion, it goes in Spanish"*. Paths, infrastructure types and comments stay in English |

## Interfaces

```ts
// src/server/domain/redondeo.ts
export type Centimos = number;        // integer, minor unit (ADR-0011)
export type PuntosBasicos = number;   // 18 % is 1800 (ADR-0039)

/** THE system's single rounding point (ADR-0032): to the cent, half up,
 *  symmetric around zero. Throws if the result is not a safe integer. */
export function redondear(numerador: bigint, denominador: bigint): Centimos;

/** Family B. The division by 10 000 happens INSIDE `redondear`: there is no
 *  second rounding anywhere (TECH-DESIGN 437). */
export function porcentaje(base: Centimos, puntos: PuntosBasicos): Centimos;
// full implementation: return redondear(BigInt(base) * BigInt(puntos), 10_000n);

export interface ParteReparto<T> { clave: T; peso: number }          // peso: NOT money
export interface ParteRepartida<T> extends ParteReparto<T> { monto: Centimos }

/** Family A. Truncates each part and hands out the remainder one cent at a time
 *  in the injected order. Σ monto === total, by construction. Returns the parts
 *  in input order; `ordenResiduo` only decides who gets the cent. */
export function reparto<T>(
  total: Centimos,
  partes: readonly ParteReparto<T>[],
  opciones: { ordenResiduo: (a: ParteRepartida<T>, b: ParteRepartida<T>) => number },
): ParteRepartida<T>[];
```

`ordenResiduo` is **required and has no default**: ADR-0032's three orders are different from each
other and a default would be a fourth order nobody chose. The combo (ADR-0029) is expressed as
*`peso` descending, ties broken by `clave` ascending*; the fixed monthly cost, as *`clave`
(operational day) ascending*. ADR-0032's third case — the consumption that **exhausts** the lot
absorbs the remainder — is **not** a distribution across lots but an incremental calculation; it
belongs to item #9 and uses `redondear(cantidad × costo_lote, cantidad_lote)`, which this module
already provides.

```ts
// src/server/db/kysely.ts
export function createDb(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

// src/server/trpc/context.ts   (today: Record<string, never>)
export interface Context { readonly db: Kysely<DB> }
export function createContextFactory(db: Kysely<DB>): (opts: {
  req: IncomingMessage; res: ServerResponse;
}) => Context;
```

The context carries **a handle, never data**: there is no per-request and no per-process memo. Caching
a configuration row in the context would be a second source of truth that desynchronizes the moment a
new effective row is written (ADR-0013).

```ts
// src/server/domain/vigencias.ts
export type Vigencia<T> =
  | { readonly estado: 'vigente'; readonly valor: T }
  | { readonly estado: 'sin_vigencia' };

export function configuracionCostosVigente(
  db: Kysely<DB>, momento?: Date,
): Promise<Vigencia<Selectable<DB['configuracion_costos']>>>;
export function calendarioAperturaVigente(
  db: Kysely<DB>, momento?: Date,
): Promise<Vigencia<Selectable<DB['calendario_apertura']>>>;
```

```ts
const instante = momento === undefined ? sql<Date>`now()` : sql<Date>`${momento}::timestamptz`;
const fila = await db
  .selectFrom('configuracion_costos')
  .selectAll()
  .where(sql<boolean>`dia_operativo(vigente_desde) <= dia_operativo(${instante})`)
  .orderBy('vigente_desde', 'desc')   // UNIQUE(vigente_desde) ⇒ total order, no arbitrary tie-break
  .limit(1)
  .executeTakeFirst();
return fila === undefined ? { estado: 'sin_vigencia' } : { estado: 'vigente', valor: fila };
```

- **The default is SQL's `now()`, never Node's `new Date()`**: two clocks means a different operational
  day per layer. `momento` exists because the income statement (item #21) needs *the effective row that
  governed on a given day*, and because it makes boundary cases testable without touching the machine
  clock.
- `${momento}` travels as a **bound parameter** (`$1`), never interpolated — ADR-0039 / TECH-DESIGN 438.

### Read path

```
tRPC procedure ──► ctx.db (Kysely<DB>) ──► SELECT * FROM configuracion_costos
                                           WHERE dia_operativo(vigente_desde) <= dia_operativo(now())
                                           ORDER BY vigente_desde DESC LIMIT 1
                                                    │
                                    ┌───────────────┴───────────────┐
                                0 rows                           1 row
                                    │                               │
                        {estado:'sin_vigencia'}          {estado:'vigente', valor}
                                    │                               │
                 the consumer marks the period            normal calculation
                 INCOMPLETE (TECH-DESIGN 833) —
                 never a 0 that looks like a number
```

## File changes

| File | Action | What |
|---|---|---|
| `migrations/0002_dia_operativo_y_vigencia.sql` | Create | `dia_operativo()`, the trigger function, two triggers |
| `src/server/domain/redondeo.ts` | Create | `redondear`, `porcentaje`, `reparto` |
| `src/server/domain/vigencias.ts` | Create | `Vigencia<T>` and the two resolutions |
| `src/server/db/kysely.ts` | Create | `createDb(pool)` over `PostgresDialect` |
| `src/server/db/schema.d.ts` | Create | **Generated** by `npm run db:types`, committed |
| `src/server/trpc/context.ts` | Modify | `Record<string, never>` → `{ db }` via `createContextFactory` |
| `src/server/index.ts` | Modify | `ServerConfig.db`, `createContextFactory(db)`, teardown via `db.destroy()` |
| `package.json` | Modify | `kysely` (dep), `kysely-codegen` (dev), `db:types` script |
| `tests/integration/{http-pipeline,trpc,routes,transport}.test.ts` | Modify | Pass `db` into `createServer` (D2-G) |
| `tests/unit/redondeo.test.ts`, `tests/unit/sin-redondeo-suelto.test.ts` | Create | Families A/B; structural ban |
| `tests/integration/{dia-operativo,vigencia,schema-types}.test.ts` | Create | Real database (ADR-0003, ADR-0038) |
| `adrs/0042-capa-de-acceso-a-datos.md` | Create | ADR-0042, append-only |
| `TECH-DESIGN.md` | Modify | ADR-0042 row in the decisions table + *Resolución de vigencias* block (written by `sdd-spec`) |

## Testing strategy

| Layer | What | How |
|---|---|---|
| Unit | `redondear`: 0.5 and −0.5; sub-cent (180 g out of 1200 g at 5000 → **750**, TECH-DESIGN 788); `BigInt(1.5)` throws; safe-integer overflow throws | Pure, no database |
| Unit | `porcentaje`: a single rounding (1800 bp over boundary bases); **sum of rows ≠ recalculation over the aggregate** is documented by a test | Pure |
| Unit | `reparto`: Σ = total over random weights (property); the combo's remainder order; a non-total comparator **throws**; empty parts / Σ weights 0 throw; negative total | Pure |
| Unit | **Structural ban**: `Math.*`, `toFixed`, `parseFloat` appear nowhere under `src/server/**` (today: 0 occurrences) | Source reading |
| Integration | `dia_operativo()`: ADR-0028's four examples (Sat 23:40, Sun 00:30, Sun 01:00, Sun 11:00) and the gap-free partition | Real PostgreSQL |
| Integration | Rejection: `vigente_desde` = start of today's operational day minus 1 s ⇒ `23514` + `constraint = vigente_desde_no_retroactiva`; start of today's operational day ⇒ **accepted**; `UPDATE` of another column on an old row ⇒ **accepted** | Transaction with rollback |
| Integration | **The mechanism is the trigger**: `pg_constraint` has no `CHECK` mentioning `dia_operativo` on those tables | Catalog query |
| Integration | Effective row: greatest `vigente_desde` ≤ today; empty table ⇒ `sin_vigencia`; a past `momento` returns the row that governed then | Transaction with rollback |
| Integration | Generated types == migrated schema | Golden test (P2) |

The assertion over `pg_constraint` is what **freezes decision P1**: without it, somebody "simplifies"
the trigger into a `CHECK` six months from now, everything stays green, and the restore bomb is armed
again with nothing raising a flag. A real `pg_dump`/`pg_restore` round trip proves the same thing more
directly but requires the `pg_dump` binary on the PATH: it stays **documented as a manual
verification**, not as a suite test.

Tests that insert rows run inside a transaction that ends in `ROLLBACK` (`db.transaction()`), because
this item exercises no `FOR UPDATE` across connections and needs the table to end up empty again for
the `sin_vigencia` case. The rows are test rows: `creada_por` has no FK yet (that arrives with item #3).

## Threat matrix

This change adds **one subprocess** (`kysely-codegen`) and no other boundary. No new routing, no git or
PR automation, no executable-file classification.

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A — no file is classified or executed based on its name |
| Git repository selection | N/A — git is not invoked |
| Commit state | N/A — neither the index nor the working tree is touched |
| Push state | N/A — there is no push |
| PR commands | N/A — there is no PR automation |

The real subprocess boundary is contained by design and **does not** require new matrix tests: fixed
arguments in `package.json` with nothing from input interpolated, the connection comes from the
environment, it writes exactly one path, and **the golden test uses `TEST_DATABASE_URL` and a temporary
file** — never `DATABASE_URL` and never the source tree, so it cannot introspect a developer's database
nor leave the repo dirty.

## Migration / Rollout

`migrations/0002_*.sql` over two empty tables: no backfill and no window. Rollback per the proposal: a
forward-only `0003_` that does `DROP TRIGGER` × 2 and `DROP FUNCTION` × 2 (the runner is forward-only,
there is no `down`). Kysely is removed by reverting `context.ts`, `index.ts` and the two domain modules
back to `pool.query`: no schema object depends on it. ADR-0042 is replaced by a new ADR, never edited.

## Open Questions

- [ ] `redondear` being **symmetric around zero** (D2-D) is written neither in ADR-0032 nor in any
      acceptance criterion: it needs its own checkbox in TECH-DESIGN, or it stays decided but not
      propagated — this project's dominant failure mode.
- [x] **Resolved** — artifact language. This design was originally written in Spanish while item #1's
      was in English, per `openspec/config.yaml` (*"SDD artifacts in English"*). The convention is now
      settled: SDD artifacts under `openspec/` are dev-only scaffolding and their prose is **English**;
      the literal domain identifiers of TECH-DESIGN and the data model stay in Spanish (ADR-0040),
      including `redondear` / `reparto` / `porcentaje` per D2-I.
- [ ] It is still unresolved who owns the **first production INSERT** into the versioned tables
      (#3 vs #25). This item only writes test rows, so it does not force the answer.
- [ ] Should `UPDATE` of `vigente_desde` be forbidden outright (ADR-0022: *"saving creates a new
      version; it does not edit the current one"*)? The trigger only forces it forward. That belongs to
      item #25's write path.
