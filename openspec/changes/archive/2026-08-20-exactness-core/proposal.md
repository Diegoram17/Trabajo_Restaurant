# Proposal: Núcleo de exactitud (exactness-core)

BACKLOG item #2.

## Intent

Money and time are this project's silent-failure axes: a float cent or a bare `DATE(timestamp)` yields a
plausible number that never reconciles. ADR-0011/0032/0028/0022/0039 decided the rules; nothing enforces
them yet. This item builds the enforcement primitives before any entity can consume them wrong, and closes
item #1's one deliberate deferral — the reason `src/server/trpc/context.ts` is empty today.

## Scope

### In Scope
- Rounding primitives (pure TS): one half-up-to-cent function; `reparto` (truncate + deterministic
  residue) and `porcentaje` (round at the finest persisted row, sum upward) — parameterized so #8/#9/#19/
  #25/#28 compose without editing them.
- `dia_operativo(timestamptz) RETURNS date` as a Postgres function (ADR-0028: one place in the DB).
- DB-level temporal rule on `vigente_desde` (`configuracion_costos`, `calendario_apertura`) against
  `dia_operativo(now())` — the literal debt item #1's spec deferred here.
- **ADR-0042 (new): data-access layer = Kysely**, plus its row in TECH-DESIGN.md's decisions table.
- Wire the resulting DB handle into `src/server/trpc/context.ts`.
- First domain query: vigencia resolution — greatest `vigente_desde` ≤ `dia_operativo(now())`.
- New TECH-DESIGN.md criteria block "Resolución de vigencias" — that algorithm is written nowhere today.

### Out of Scope
- 0..10000 basis-points range CHECK — confirmed BACKLOG #25's.
- `configuracion_operativa` — untouched.
- First *production* INSERT into the versioned config tables — #3 and #25 both claim it; flagged, not
  resolved. This item uses test-only rows (`creada_por` has no FK yet).
- Entity-specific reparto/porcentaje consumers; Turno/ServicioCocina/Calendario day criteria — later items.

## Capabilities

### New Capabilities
- `money-rounding`: the single rounding function and the reparto/porcentaje families.
- `operational-day`: `dia_operativo()` semantics, partition invariant, 05:00 axis.
- `vigencia-resolution`: forward-only `vigente_desde` enforcement plus the version-in-force query.
- `data-access`: bound-parameter mandate, snake_case identity, row locking reachable.

### Modified Capabilities
- `base-schema`: requirement "`vigente_desde` Ships Without a Temporal Constraint" is superseded — the
  constraint now exists.

## Approach

ADR-0042 selects **Kysely**:

| Option | Verdict |
|---|---|
| Prisma | Out — own migration engine (#1 rejected that), camelCase vs ADR-0040, weak `FOR UPDATE` on #9's hot path |
| Drizzle | Out — hand-authored TS schema is a second source of schema truth beside the SQL migrations |
| Raw `pg` | Out — hand-maintained row types drift silently across 20+ remaining items |
| **Kysely** | Types generated *from* the migrated DB; `.forUpdate()` first-class (ADR-0007/0030); snake_case passthrough free; no migration engine; `sql` tag binds values, so ADR-0039 is the default path |

Sequence: primitives + `dia_operativo()` (ADR-independent) → ADR-0042 + context wiring → temporal rule →
vigencia query.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `migrations/0002_*.sql` | New | `dia_operativo()`, temporal rule |
| `adrs/0042-*.md` | New | Data-access ADR (append-only) |
| `TECH-DESIGN.md` | Modified | Decisions row + "Resolución de vigencias" criteria |
| `src/server/trpc/context.ts` | Modified | Carries the DB handle |
| `src/server/domain/**` | New | Rounding primitives, vigencia query |
| `tests/{unit,integration}/**` | New | Rounding units; DB-level day/rejection/vigencia tests |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Generated types go stale after a migration | Med | Codegen wired to the migrate script; sdd-design owns it |
| `CHECK` vs trigger for a non-immutable comparison | Med | Open question for sdd-design; the integration test proves rejection either way |
| Kysely wrong for #9's FIFO lock | Low | `.forUpdate()` plus `sql` escape hatch; reversible while only #2 depends on it |

## Rollback Plan

Revert `migrations/0002_*.sql` via a forward `0003_` dropping the constraint and function (the runner is
forward-only, no `down`). Drop Kysely by reverting `context.ts` and the domain module to `pool.query` — no
schema depends on it. ADR-0042 is superseded by a new ADR, never edited.

## Dependencies

- Item #1 merged (pool, migration runner, config tables, Vitest) and a real PostgreSQL for integration tests.

## Success Criteria

- [ ] A past `vigente_desde` is rejected by the database, not by the app.
- [ ] `dia_operativo()` exists once in the DB; no second day-boundary calculation.
- [ ] ADR-0042 exists with its TECH-DESIGN.md table row.
- [ ] "Resolución de vigencias" criteria block written into TECH-DESIGN.md.
- [ ] TECH-DESIGN.md criteria at lines 778–790, 813–823, 436–440 closed for everything needing no
      consuming entity.
