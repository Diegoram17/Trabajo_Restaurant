```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f03f566c8c0acd5a038e1dd776e96dc2f457e4d980438fd6cad308276fd4326a
verdict: fail
blockers: 2
critical_findings: 2
requirements: 9/11
scenarios: 22/24
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:24cf32901ffaddd4a0a8cd02f59647133c6c8678699df9d1b99da9f0a7e24a9b
build_command: npm run typecheck
build_exit_code: 0
build_output_hash: sha256:0a0f97b53780ab4d4eac079e24e6b245e81f130b30f408f5d2b26b2feadf58e2
```

## Verification Report

**Change**: exactness-core (BACKLOG.md item #2, Nucleo de exactitud)
**Version**: N/A (no spec version field)
**Mode**: Strict TDD

All 3 chained PRs are merged into main locally (1f14bf1 "Merge PR1: money-rounding domain",
6eee937 "Merge PR2+PR3: operational day, vigencia trigger and Kysely data-access layer"), not
pushed to origin. Working tree clean. openspec/changes/exactness-core/tasks.md mirror on main
matches the Engram sdd/exactness-core/tasks content exactly (31/31 tasks marked done).

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 31 |
| Tasks complete | 31 |
| Tasks incomplete | 0 |

### Build and Tests Execution
**Build**: PASSED
```text
$ npm run typecheck
> tsc -p tsconfig.json --noEmit
(no output, exit 0)
```

**Tests**: 93 passed / 0 failed / 0 skipped (14 files) -- full suite, real PostgreSQL
```text
$ npm test
> vitest run
> tsx scripts/migrate.ts   (globalSetup pre-step)
No pending migrations.
Test Files  14 passed (14)
     Tests  93 passed (93)
```
Also independently: npm run test:unit gave 6 files, 50 passed, 0 failed (pure, no DB).
Both npm test and npm run typecheck were run twice in this session with identical results
(deterministic). Note: the apply-progress record PR-local numbers (for example 68/68 on PR3 own
branch, 59/59 on PR2 own branch) were partial by construction -- each branch lacked the other
branches commits before merge. The 93/93 figure above is the first real measurement of the fully
merged tree and was generated fresh in this session, not copied from apply-progress.

**Coverage**: Not available -- no coverage tool detected in package.json (no --coverage script,
no c8/nyc/@vitest/coverage-v8 devDependency). Skipped, not a failure.

### Independent Runtime Verification (beyond re-running the existing suite)

The task explicitly asked not to trust the existing test/report claims alone. Beyond re-running
npm test and npm run typecheck, I queried the real database directly (TEST_DATABASE_URL, loaded
from .env via the project own loadDotEnv()), independently of any test file in the repo:

- schema_migrations table: 0001_configuracion.sql and 0002_dia_operativo_y_vigencia.sql both
  present with aplicada_en timestamps -- confirms migration 0002 is genuinely applied, not just
  present on disk.
- pg_constraint on configuracion_costos/calendario_apertura: only PRIMARY KEY and
  UNIQUE (vigente_desde) constraints exist. Zero CHECK constraints on either table --
  independently confirms the trigger-not-CHECK claim (ADR-0042 P1), not derived from the repo own
  freeze test.
- information_schema.triggers: exactly one trigger, vigente_desde_no_retroactiva, BEFORE
  INSERT and BEFORE UPDATE, on both tables, calling vigencia_no_retroactiva().
- pg_proc: dia_operativo is provolatile=s (STABLE) and proparallel=s (PARALLEL SAFE),
  matching the migration declared STABLE STRICT PARALLEL SAFE.
- Live behavioral proof, outside any test file: attempted INSERT into configuracion_costos with
  vigente_desde = now() minus interval 10 days inside a rolled-back transaction -- rejected with
  error.code = 23514, error.constraint = vigente_desde_no_retroactiva. A second attempt with
  vigente_desde = now() plus interval 1 hour -- accepted (then rolled back). Both match the
  base-schema MODIFIED requirement scenarios exactly.
- Confirmed adrs/0042-capa-de-acceso-a-datos.md is a wholly new file (git diff --stat
  1871d5e..HEAD -- adrs/ shows only that one file, 128 insertions, 0 deletions) -- no prior ADR
  file was touched by this change; append-only property holds.
- Confirmed the two flagged deviations are real, present in the merged tree, not debug leftovers:
  tests/integration/vigencia.test.ts line 172 -- await trx.rollback().execute() (not bare
  .rollback()), with an explanatory comment. vite.config.ts line 31 -- fileParallelism: false is
  present in the test block.
- Confirmed Kysely SelectQueryBuilder genuinely exposes forUpdate(), file
  node_modules/kysely/dist/query-builder/select-query-builder.d.ts -- the row-locking capability
  ADR-0042 claims is structurally real in the installed library. However, see CRITICAL-2 below:
  no test in this repo exercises it.

### Spec Compliance Matrix

**Domain: money-rounding** (3 requirements, 6 scenarios -- all COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Single cent-rounding function | Half-cent rounds up | redondeo.test.ts: rounds a positive exact half up to the next integer | COMPLIANT |
| Single cent-rounding function | Percentage: no second rounding point | redondeo.test.ts: applies a single rounding through redondear(base * puntos, 10000n) | COMPLIANT |
| Allocation respects total | Sum of parts equals total | redondeo.test.ts: sum of allocated parts equals total, 200-iteration property test | COMPLIANT |
| Allocation respects total | Remainder order is caller-injected | redondeo.test.ts: combo order test plus fixed-cost order test | COMPLIANT |
| Allocation respects total | Zero remainder leaves parts unchanged | redondeo.test.ts: zero remainder leaves every part exactly at its truncated share | COMPLIANT |
| Percentage: no repeat rounding over aggregate | Aggregate equals sum of rounded rows | redondeo.test.ts: summing already-rounded rows is not the same as recalculating over the aggregate | COMPLIANT |

**Domain: operational-day** (3 requirements, 6 scenarios -- all COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| dia_operativo pivots 05:00 Lima | Sat 23:40 to Saturday | dia-operativo.test.ts: Saturday 23:40 Lima falls within Saturday operational day | COMPLIANT |
| dia_operativo pivots 05:00 Lima | Sun 00:30 to Saturday | dia-operativo.test.ts: Sunday 00:30 Lima still falls within Saturday, not Sunday | COMPLIANT |
| dia_operativo pivots 05:00 Lima | Sun 05:01 to Sunday | dia-operativo.test.ts: Sunday 05:01 Lima already falls within Sunday operational day | COMPLIANT |
| dia_operativo pivots 05:00 Lima | Exact 05:00 cutoff to new day | dia-operativo.test.ts: the exact 05:00:00 cutoff already belongs to the day that is starting | COMPLIANT |
| No gaps or overlaps | 04:59:59 vs 05:00:00 consecutive | dia-operativo.test.ts: 04:59:59 and 05:00:00 land on consecutive operational days, with no overlap | COMPLIANT |
| Constant, not configurable | Result independent of config tables | dia-operativo.test.ts: does not read configuracion_costos, calendario_apertura or configuracion_operativa | COMPLIANT |

**Domain: vigencia-resolution** (1 requirement, 4 scenarios -- all COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Highest vigente_desde whose day arrived | Several past versions, highest chosen | vigencia.test.ts: several effective versions exist, the highest vigente_desde not exceeding momento is chosen | COMPLIANT |
| Highest vigente_desde whose day arrived | Future version excluded despite matching calendar date | vigencia.test.ts: a future effective version is excluded even though its raw calendar date matches momento | COMPLIANT |
| Highest vigente_desde whose day arrived | No applicable version returns sin_vigencia | vigencia.test.ts: empty table resolves to sin_vigencia, both tables | COMPLIANT |
| Highest vigente_desde whose day arrived | Same-day disambiguation | vigencia.test.ts: two effective versions on the same operational day are disambiguated by the highest vigente_desde | COMPLIANT |

**Domain: data-access** (3 requirements, 4 scenarios -- 2 COMPLIANT, 2 CRITICAL/UNTESTED)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Bound parameter for money/pct writes | Writing an amount uses a bound parameter | vigencia.test.ts second describe block, insertarConfiguracionCostos via Kysely insertInto(configuracion_costos).values with salario_cocina 150000 etc -- Kysely PostgresDialect parameterizes values() by construction; exercised at runtime | COMPLIANT |
| Bound parameter for money/pct writes | No money-writing path bypasses the bound parameter, full write-surface audit | none found -- no dedicated audit test exists, unlike sin-redondeo-suelto.test.ts for the rounding domain; I manually grepped src/server for INSERT INTO, UPDATE SET, client.query and found zero raw money-writing paths, but this is my own static audit, not a runtime-covering test owned by the repo | CRITICAL -- UNTESTED |
| Spanish identifiers pass through unmapped | vigente_desde reaches the generated type unchanged | schema-types.test.ts plus committed src/server/db/schema.d.ts, vigente_desde field typed Timestamp, snake_case, no camelCase anywhere | COMPLIANT |
| Row locking reachable, no escape hatch | A query can request row locking via the layer API | none found -- no test in the repo calls forUpdate() or exercises row locking through Kysely; I confirmed only that the library exposes it via static package inspection | CRITICAL -- UNTESTED |

**Domain: base-schema (MODIFIED)** (1 requirement, 4 scenarios -- all COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| vigente_desde rejects a past operational day at the DB level | Past operational day rejected | vigencia.test.ts: rejects a vigente_desde one second before today operational day start, plus my own independent live-DB re-verification | COMPLIANT |
| same requirement | Current/future accepted | vigencia.test.ts: accepts a vigente_desde exactly at today operational day start, plus my own independent live-DB re-verification | COMPLIANT |
| same requirement | Comparison uses operational day, not calendar date | vigencia.test.ts: rejects a vigente_desde one second before, deliberately shares raw calendar date with today while landing in the previous operational day | COMPLIANT |
| same requirement | Zero inserted rows breaks nothing | Structural: migration 0002 applies cleanly against the still-empty tables every run, schema_migrations bookkeeping, No pending migrations observed on 2 independent npm test runs this session | COMPLIANT |

**Compliance summary**: 22/24 scenarios compliant, 2 CRITICAL/UNTESTED (both in data-access).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| redondear half-up, symmetric around zero | Implemented | Magnitude-based rounding plus sign restore, redondeo.ts lines 25-40; matches TECH-DESIGN.md line 782 |
| porcentaje single rounding point | Implemented | redondear(BigInt(base)*BigInt(puntos), 10000n), division inside redondear |
| reparto caller-injected order, total-order check | Implemented | verificarOrdenTotal rejects a comparator returning 0 for distinct parts before assigning remainder |
| dia_operativo STABLE STRICT PARALLEL SAFE | Implemented | Confirmed both in migration SQL and live pg_proc query |
| Trigger, not CHECK | Implemented | Confirmed live via pg_constraint, 0 CHECK rows, plus information_schema.triggers, 2 BEFORE triggers |
| Vigencia union, no default substitution | Implemented | vigencias.ts lines 11-15, comoVigencia |
| Context.db and ServerConfig.db required, not optional | Implemented | context.ts lines 14-16, index.ts lines 38-42 |
| db.destroy() teardown | Implemented | index.ts lines 185-190, SIGTERM/SIGINT, plus every integration test own afterAll |
| schema.d.ts golden-gate test | Implemented | schema-types.test.ts, CRLF-normalized comparison against a temp-regenerated file, never touches the source tree |
| ADR-0042 append-only | Implemented | New file only; git diff --stat confirms no prior ADR modified |
| TECH-DESIGN.md ADR-0042 row plus Resolucion de vigencias block | Implemented | Lines 109, 827-839, in Spanish, matching project convention |
| ControlledTransaction rollback().execute() fix | Implemented | vigencia.test.ts line 172, with explanatory comment |
| vite.config.ts fileParallelism false fix | Implemented | vite.config.ts line 31 |
| Bound-parameter write-surface audit, data-access | Not covered by a dedicated test | See CRITICAL-1 |
| Row-locking reachability, data-access | Not covered by a dedicated test | See CRITICAL-2, library capability confirmed statically |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D2-C/D2-D single rounding point, bigint numerator/denominator | Yes | redondear takes bigint, not number; a float cannot even reach it |
| D2-E ordenResiduo required, no default | Yes | No default parameter; throws if omitted (TS) and if it is not a total order (runtime) |
| D2-F Kysely wraps the existing pg.Pool, does not own its own | Yes | createDb(pool) takes the pool as a parameter |
| D2-G Context.db and ServerConfig.db required | Yes | Both are non-optional fields |
| D2-H Vigencia union | Yes | As implemented |
| P1, trigger over CHECK, rationale in ADR-0042 | Yes | Matches migration plus live DB state |
| P2, codegen golden-test gate, never auto-regenerate | Yes | No postmigrate/pretest hook regenerates schema.d.ts; only the test compares a temp file |
| stacked-to-main chain strategy, PR1/PR2 independent siblings, PR3 depends on PR2 | Yes | Confirmed via git log: 1f14bf1 merges PR1 off main at 1871d5e, 6eee937 merges PR2+PR3 together, PR3 branch built off PR2 |

### TDD Compliance
| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | Present in apply-progress for PR3, full table; PR1/PR2 condensed to commit-level RED/GREEN summaries in the current Engram revision, an earlier revision had the full table per the record own note, not directly retrievable via mem_get_observation in this session |
| All tasks have tests | Yes | Every RED task, 1.1, 1.3, 1.5, 1.7, 2.2, 2.4, 3.4, 3.9, has a corresponding test file/block, confirmed by direct reading |
| RED confirmed, tests exist | Yes | All test files read directly; substantive, non-trivial assertions throughout |
| GREEN confirmed, tests pass | Yes | 93/93 npm test plus 50/50 npm run test:unit, independently re-run twice this session |
| Triangulation adequate | Yes | Property test with 200 random cases for reparto; 4 boundary vectors for dia_operativo; 8 distinct cases for vigencia resolution across 2 tables |
| Safety net for modified files | Yes | The 4 wiring-only integration test files, http-pipeline, trpc, routes, transport, diffed cleanly: only db construction/teardown added, zero assertion changes |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 50 | 6 | vitest, pure, no DB |
| Integration | 43 | 8 | vitest plus real PostgreSQL, pg, ADR-0038 |
| E2E | 0 | 0 | not installed |
| Total | 93 | 14 | |

---

### Changed File Coverage
Coverage analysis skipped -- no coverage tool detected, no @vitest/coverage-v8, c8, or nyc in
package.json, no --coverage script.

---

### Assertion Quality
All assertions verify real behavior. Scanned every new/modified test file,
redondeo.test.ts, sin-redondeo-suelto.test.ts, dia-operativo.test.ts, vigencia.test.ts,
schema-types.test.ts, and the 4 wiring-only integration files, for banned patterns,
tautologies, ghost loops, smoke-test-only, mock-heavy, CSS/implementation-detail coupling: zero
matches. sin-redondeo-suelto.test.ts is notable for validating its own detector against inline
fixtures, positive and negative, before running it on real source, so its zero-occurrences result
is backed by a scanner proven to catch a real violation, not vacuously true.

---

### Quality Metrics
**Linter**: Not available, no lint script/config detected
**Type Checker**: No errors, npm run typecheck, exit 0, re-run twice

### Issues Found

**CRITICAL**:
1. Data-access scenario "No money-writing path bypasses the bound parameter" has no covering
   test. The rounding domain has a dedicated structural audit, sin-redondeo-suelto.test.ts,
   proving zero occurrences of loose rounding; no equivalent audit exists for raw
   SQL/string-interpolated money writes. I manually grepped src/server for INSERT/UPDATE literals
   and found zero current violations, but that is my own one-off static check, not a
   runtime-covering test the repo owns going forward -- a future write path could silently
   interpolate a literal and nothing would fail.
2. Data-access scenario "Row locking is reachable with no escape hatch" has no covering test.
   I independently confirmed Kysely SelectQueryBuilder exposes forUpdate(), library-level,
   static inspection, so the capability is real, but nothing in this codebase calls it or proves
   it is reachable end-to-end against the real database. Neither the tasks list, Phase 3, nor any
   test file mentions forUpdate().

**WARNING**: None.

**SUGGESTION**:
1. Consider a minimal integration test, a handful of lines, mirroring the existing
   vigencia.test.ts transaction pattern, that opens a transaction, calls forUpdate() on a
   configuracion_costos select, and asserts the query executes -- this would close CRITICAL-2 with
   very little new code, and does not require inventing a new money-writing feature.
2. A sin-redondeo-suelto.test.ts-style structural audit, regex-scan src/server for
   string-built INSERT/UPDATE touching money/percentage columns, or more simply for any
   hand-built SQL string containing a numeric literal in a value position, would close CRITICAL-1
   without waiting for a real money-writing feature to exist.
3. The apply-progress record currently reports test counts per-PR-branch, accurate for their own
   scope at the time, but no observation in Engram records the fully-merged tree 93/93 number;
   consider a short post-merge note so future readers do not need to re-derive it as done here.

### Verdict
FAIL
2 CRITICAL findings, both UNTESTED spec scenarios in the data-access domain, block archive-readiness.
Every other requirement/scenario across all 5 domains is genuinely implemented and independently
verified against real code and a live database, including two direct-to-Postgres checks run outside
the existing test suite, a pg_constraint/triggers catalog query, and a live retroactive-insert
rejection test, that were not already covered by mem/apply-progress narrative alone.
