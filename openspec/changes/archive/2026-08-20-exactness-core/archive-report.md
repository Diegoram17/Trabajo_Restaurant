# Archive Report: Exactness Core (exactness-core)

**Change**: BACKLOG item #2 — Núcleo de exactitud  
**Archived to**: `openspec/changes/archive/2026-08-20-exactness-core/`  
**Date**: 2026-08-20  
**Status**: COMPLETE (PASS)

## Artifact Lineage

| Artifact | Observation ID | Created | Status |
|----------|---|---|---|
| Proposal | #51 | 2026-08-20 09:51:37 | Archived |
| Spec (Delta: 5 domains) | #52 | 2026-08-20 10:00:10 | Merged to main specs |
| Design | #53 | 2026-08-20 10:06:45 | Archived |
| Tasks | #54 | 2026-08-20 12:25:14 | Archived (33/33 complete) |
| Apply Progress | #55 | 2026-08-20 12:40:49 | Reference snapshot (work continued through Phase 5) |
| Verify Report | #56 | 2026-08-20 14:31:07 | Archived (RE-VERIFICATION: PASS) |

## Final State Authority

This archive report records the state of the change at close. Per the Final-State Authority hierarchy in the SKILL, final-state facts from the orchestrator's launch prompt outrank intermediate snapshots from apply-progress and verify-report.

The orchestrator's explicit final-state facts (provided in the launch prompt) confirm:
- All 33 tasks complete (31 original + 2 Phase 5 remediation)
- Full-suite state: `npm test` → 16 test files, 102 tests, all passing
- `npm run typecheck` → clean, zero errors
- Final re-verification verdict: PASS, 0 CRITICAL, 0 WARNING, 3 SUGGESTION (non-blocking)
- 24/24 spec scenarios compliant across all 5 domains
- 11/11 requirements complete
- Two CRITICAL findings from initial verify-report (data-access domain) closed by Phase 5 remediation (commits b0097c9, 8ce0663, 3e9d906)

### Verification Status

**Verdict**: PASS  
**Critical findings**: 0  
**Warnings**: 0  
**Suggestions**: 3 (non-blocking)

Per the final verify-report (#56, generated 2026-08-20 14:31:07 after Phase 5 remediation):
- 11/11 requirements verified compliant across all 5 domains
- 24/24 scenarios verified compliant
- 102 tests passed (16 files) on full tier with real PostgreSQL
- `npm run typecheck` clean, exit 0, independently re-run and hash-verified as deterministic
- All 5 domain implementations verified sound through independent runtime verification (live database transactions, genuine concurrent row-locking proof, structural audit patterns)

### Work Delivered

**Implementation phases**: 5 phases across 3 chained PRs + Phase 5 remediation:

#### Phase 1: Rounding domain (PR 1)
- `src/server/domain/redondeo.ts` (new): `redondear`, `porcentaje`, `reparto` families
- `tests/unit/redondeo.test.ts`, `tests/unit/sin-redondeo-suelto.test.ts` (new)
- TECH-DESIGN.md checkpoint for half-up-symmetric-around-zero rule

#### Phase 2: Operational day & vigencia trigger (PR 2)
- `migrations/0002_dia_operativo_y_vigencia.sql` (new): `dia_operativo()` function, temporal rejection trigger
- `tests/integration/dia-operativo.test.ts`, `tests/integration/vigencia.test.ts` (new)

#### Phase 3: Data access layer (PR 3)
- `src/server/db/kysely.ts` (new): `createDb(pool)` wrapper
- `src/server/domain/vigencias.ts` (new): effective-row resolution via Kysely
- `src/server/db/schema.d.ts` (new, generated): committed type-safety gate
- `src/server/trpc/context.ts` (modified): required `db` handle
- `src/server/index.ts` (modified): wiring and teardown
- `adrs/0042-capa-de-acceso-a-datos.md` (new, append-only): ADR-0042 decision
- `TECH-DESIGN.md` (modified): ADR-0042 row, "Resolución de vigencias" criteria block

#### Phase 4: Verification (completed within PR 3)
- Full suite green: 93 tests, 11 test files

#### Phase 5: Verify remediation (data-access, 2 CRITICAL → PASS)
- `tests/unit/sin-sql-interpolado.test.ts` (new): structural audit closing "bound parameter write-surface" requirement
- `tests/integration/row-locking.test.ts` (new): genuine PostgreSQL row-locking concurrency proof closing "row-locking reachability" requirement
- `openspec/changes/exactness-core/tasks.md` (modified): Phase 5 section added

All work merged to `main` (not pushed to origin). Final state: clean working tree at HEAD 3e9d906.

### Implementation Completeness

**Task status**: 33/33 complete (verified from #54 artifact; all tasks marked `[x]`).

**Specification mapping**:
- money-rounding domain: 3 requirements, 6 scenarios — all compliant
- operational-day domain: 3 requirements, 6 scenarios — all compliant
- vigencia-resolution domain: 1 requirement, 4 scenarios — all compliant
- data-access domain: 3 requirements, 4 scenarios — all compliant (was 2/4 before Phase 5)
- base-schema domain (MODIFIED): 1 requirement updated, 4 scenarios — all compliant

**Total**: 11 requirements, 24 scenarios, 100% compliant.

### Decisions Propagated

**ADR-0042** (new, append-only): Data-access layer = Kysely
- Rows generated from migrated database schema, snake_case passthrough, `.forUpdate()` first-class
- Migrated database as source of truth for types (vs. hand-authored TS schema, vs. no schema)
- Codegen gate prevents type drift (golden test on every `npm test`)

**Design decisions** (P1, P2 from #53):
- P1: Temporal rule implemented as `BEFORE` trigger (not `CHECK`) for restore/rewrite safety
- P2: Generated types committed + golden-test gate (vs. not committed or generated on demand)

**Minor propagations**:
- D2-D: `redondear` symmetric around zero (new TECH-DESIGN checkbox, per #54 task 1.9)
- D2-C/D2-E/D2-F/D2-G/D2-H: All 8 design decisions (D2-*) followed; none violated

### TECH-DESIGN.md Propagation

Two new sections added:
1. ~line 781: Checkbox for D2-D (half-up-symmetric-around-zero) — was implicit, now explicit
2. ~line 826: New "Resolución de vigencias" criteria block — greatest-vigente_desde-≤-today algorithm, Spanish domain identifiers

ADR-0042 recorded in the decisions table.

### Spec Merge Details

**Five delta specs merged/created**:

| Domain | Action | Details |
|--------|--------|---------|
| money-rounding | Created (new domain) | Copied mechanically to `openspec/specs/money-rounding/spec.md` |
| operational-day | Created (new domain) | Copied mechanically to `openspec/specs/operational-day/spec.md` |
| vigencia-resolution | Created (new domain) | Copied mechanically to `openspec/specs/vigencia-resolution/spec.md` |
| data-access | Created (new domain) | Copied mechanically to `openspec/specs/data-access/spec.md` |
| base-schema | Modified (RENAMED + MODIFIED requirement) | Requirement "vigente_desde Ships Without..." renamed and replaced with "vigente_desde Rejects a Past Operational Day..." + 4 new scenarios in `openspec/specs/base-schema/spec.md` |

All copies verified with `diff -r` (empty diff = byte-identity).

### Archive Folder Structure

Archived to: `openspec/changes/archive/2026-08-20-exactness-core/`

Contents (all intact, verified byte-identical by `diff -r`):
- proposal.md
- design.md
- tasks.md (33/33 complete, including Phase 5 tasks 5.1-5.2)
- specs/money-rounding/spec.md
- specs/operational-day/spec.md
- specs/vigencia-resolution/spec.md
- specs/data-access/spec.md
- specs/base-schema/spec.md
- apply-progress.md (reference snapshot)
- verify-report.md (final RE-VERIFICATION: PASS)
- exploration.md (workspace planning)

### Verification Findings Summary

**Critical**: None (archive proceeds)

**Warnings**: None

**Suggestions** (3, all non-blocking, per verify-report #56):
1. Consider documenting the static-regex audit limitation in `sin-sql-interpolado.test.ts` (indirection-bypass gap; same limitation exists in the accepted `sin-redondeo-suelto.test.ts` precedent, unremarked)
2. (Resolved during this cycle) Full test-count progression (93→102) documented in apply-progress
3. (Carried forward, resolved) Decisions D2-A through D2-I all followed; no deviation

### Rollback Capability

As the second change in the repository, following item #1's app-skeleton:

**Code**: 
- Revert feature branches if needed (all 3 PRs merged to `main`)
- Code isolation: reverting `src/server/domain/redondeo.ts` + `src/server/domain/vigencias.ts` + `src/server/db/kysely.ts` + modifications to `context.ts` and `index.ts` + `package.json` deps removes all code

**Database**:
- Forward-only migration: create `migrations/0003_rollback_exactness_core.sql` dropping the 2 triggers and 2 functions
- No data backfill needed (no rows exist in the tables touched by #2)

**Documents**:
- Revert TECH-DESIGN.md checkboxes (preserve ADRs)
- Drop ADR-0042 is not an option (ADRs are append-only); instead, a new ADR supersedes it if the decision changes

**Dependency**: Item #1 merged successfully before this item started; no dependency path is broken if this item rolls back.

### Known Non-Blocking Carry-Forward

Two decisions remain unresolved per orchestrator's final-state facts (flagged during this change, NOT resolved here; belong to later items):

1. **BACKLOG #3 vs #25**: First production INSERT into `configuracion_costos`/`calendario_apertura` — which item owns this decision?
   - Item #2 uses test-only rows; `creada_por` has no FK yet (arrives with #3)
   - BACKLOG row #3 mentions the FK, BACKLOG row #25 mentions config first write
   - Resolution: belongs to the item that first exercises the full write path with constraints

2. **UPDATE of `vigente_desde`**: Should it be forbidden outright (ADR-0022: "creating a new version, not editing the current one")?
   - Item #2's trigger only rejects retroactive (past) `vigente_desde`; it permits forward updates
   - Resolution: belongs to item #25's write-path decision, not item #2

### Ripples to Later Backlog Items

Two decisions this item made that affect LATER items (captured per orchestrator instruction):

1. **Data-access layer = Kysely** (ADR-0042) for the whole project
   - Items #7+ should follow this pattern, not raw `pg`
   - Especially item #9's FIFO `SELECT ... FOR UPDATE` should use Kysely's `.forUpdate()`, not raw SQL

2. **SDD artifact language policy** (clarified this cycle, user decision 2026-08-20)
   - `openspec/{proposal,spec,design,tasks}` stay English (dev-only scaffolding)
   - `TECH-DESIGN.md`/`adrs/`/UI copy/domain identifiers stay Spanish (ADR-0040)
   - Apply this to every future backlog item's SDD cycle, not just this one

### SDD Cycle Complete

The change has been fully proposed, specified, designed, tasked, applied, verified, and archived. All implementation and proof work units closed. No CRITICAL issues. All 24 spec scenarios verified compliant with real PostgreSQL and independent verification evidence.

BACKLOG item #3 is ready to start, inheriting two explicit dependency notes (FK on `creada_por`, first production write context) and two ripple-forward implications (Kysely pattern adoption, SDD artifact language precedent).
