```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:acc6837107cb8529a09c21dff0d5cfdead511f79395fae411159b2f0ccbc58a3
verdict: pass
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 24/24
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:3af4fae7eca7b68358d970fd8f9da0d83b9a947b482300fa3c12e914221904f4
build_command: npm run typecheck
build_exit_code: 0
build_output_hash: sha256:0a0f97b53780ab4d4eac079e24e6b245e81f130b30f408f5d2b26b2feadf58e2
```

## Verification Report (RE-VERIFICATION)

**Change**: exactness-core (BACKLOG.md item #2, Nucleo de exactitud)
**Version**: N/A (no spec version field)
**Mode**: Strict TDD

This is a re-verification. The prior run (Engram sdd/exactness-core/verify-report, session
2026-08-20 14:31) returned FAIL with 2 CRITICAL findings, both in the data-access domain: no
covering test proved money-writing paths never bypass the bound parameter, and no covering test
proved Kysely .forUpdate() row-locking is reachable against real PostgreSQL. A follow-up
sdd-apply pass added Phase 5 (tasks 5.1, 5.2) and 2 new test files, committed to main:
b0097c9 (tests/unit/sin-sql-interpolado.test.ts, +119 lines, new file), 8ce0663
(tests/integration/row-locking.test.ts, +149 lines, new file), 3e9d906 (tasks.md only, +21
lines). Confirmed via git show --stat that each commit touches exactly the file it claims and
nothing else -- no change to redondeo.ts, the migration, vigencias.ts, ADR-0042, or
TECH-DESIGN.md. Working tree is clean at HEAD 3e9d906, not pushed to origin.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 33 (31 original + 2 in new Phase 5) |
| Tasks complete | 33 |
| Tasks incomplete | 0 |

### Build & Tests Execution (independently re-run this session, not trusted from prior reports)
**Build**: PASSED
```text
$ npm run typecheck
> tsc -p tsconfig.json --noEmit
(no output, exit 0)
```
Output hash sha256:0a0f97b53780ab4d4eac079e24e6b245e81f130b30f408f5d2b26b2feadf58e2 is
byte-identical to the prior verify sessions typecheck hash -- independent confirmation that the
build output is deterministic and genuinely empty, not copy-pasted between sessions.

**Tests**: 102 passed / 0 failed / 0 skipped (16 files) -- full suite, real PostgreSQL
```text
$ npm test
> vitest run
> tsx scripts/migrate.ts   (globalSetup pre-step)
No pending migrations.
Test Files  16 passed (16)
     Tests  102 passed (102)
```
Beyond the full-suite run, I additionally re-ran each of the 2 new files standalone (isolated
from the rest of the suite, ruling out ordering/shared-state effects):
`npx vitest run tests/integration/row-locking.test.ts` -> 1 file, 1 test, passed.
`npx vitest run --config vitest.unit.config.ts tests/unit/sin-sql-interpolado.test.ts` -> 1 file,
8 tests, passed. Both green with zero flakiness across these runs.

**Coverage**: Not available -- no coverage tool detected in package.json. Skipped, not a failure.

### Independent Runtime Verification (this re-verification session)

- Confirmed via `git status --porcelain` the tree is clean, and via `git show --stat` on all 3
  remediation commits that each touches only the files its message claims.
- Read both new test files directly, in full, not summarized from apply-progress.
- Confirmed `src/server/db/pool.ts` sets no explicit `max` on the `pg.Pool`, so node-postgres
  default `max: 10` applies -- ruling out a pool-starvation false positive where the row-locking
  tests trxB block could actually be a connection-acquire wait instead of a genuine row-lock
  wait. Two (and briefly three) concurrent transactions are well within the default pool size.
- `npm run typecheck` output hash matches the prior verify sessions hash exactly (both
  independently produced empty output) -- a second, independent confirmation that the build
  step is deterministic.

### Judgment on the 2 remediation tests

**tests/unit/sin-sql-interpolado.test.ts (closes CRITICAL-1 -- bound-parameter audit)**

Read directly. Three regex patterns under `PATRONES_PROHIBIDOS`:
1. `sql.raw()` called with a template literal containing `${` -- Kyselys own documented escape
   hatch that defeats parameter binding.
2. `pool.query()` / `client.query()` called with a template literal containing `${`.
3. `pool.query()` / `client.query()` whose argument is built via string concatenation
   (quote followed by `+`).

Direct check against the two example bypasses the launch task asked about:
- `pool.query(\`... ${value} ...\`)` -- matches pattern 2 exactly (backtick immediately after
  the opening paren, then `${` before the closing backtick). CAUGHT.
- `sql.raw(...)` with an interpolated value -- matches pattern 1 exactly. CAUGHT.

The file proves its own detector before trusting the zero-result scan: 7 fixture cases (3
positive, matching each violation shape; 4 negative, for legitimate Kysely patterns -- a comment
mention, Kyselys own `sql` tagged template, a `$1`-placeholder raw query, and the fluent
`.values()` builder). I traced each fixture string against the regexes myself rather than
trusting the assertion outcome alone, and the match/no-match behavior is correct in every case.
I independently re-ran this file standalone -- 8/8 passed.

Disclosed, known limitation: a value built through indirection (e.g. assigned to a variable
before being passed to `pool.query(variable)`) would not be caught by this static regex scan.
This does not change the verdict: the identical class of limitation already exists in the
accepted `sin-redondeo-suelto.test.ts` precedent from Phase 1 (already PASS in the prior
verify), and the spec requirement concerns the current write surface, which this audit covers
completely -- there is currently no indirection anywhere under `src/server/**`.

Verdict: sound. Closes CRITICAL-1.

**tests/integration/row-locking.test.ts (closes CRITICAL-2 -- row-locking reachability)**

Read directly. Two independent `ControlledTransaction` objects (`trxA`, `trxB`), each obtained
via `db.startTransaction().execute()` -- each acquires its own connection from the shared
`pg.Pool` (confirmed not starved, see pool.ts note above). `trxA` takes
`SELECT ... FOR UPDATE` via Kyselys typed `.forUpdate()` and holds it open (no commit). `trxB`
sets `SET LOCAL lock_timeout = 200ms`, issues the identical `.forUpdate()` select, and asserts
it REJECTS with PostgreSQLs own error code `55P03` (`lock_not_available`) -- a server-side error
code that can only fire if PostgreSQL genuinely could not acquire the lock within the timeout,
not a JS-side timer race. A third, fresh transaction (`trxC`) then re-acquires the identical lock
immediately after `trxA` commits, proving the earlier block was caused specifically by `trxA`s
lock and ruling out an unrelated failure mode (stuck connection, broken row, etc.) as the real
cause of the rejection.

This is genuine concurrency -- two (briefly three) live PostgreSQL sessions from the pool -- not
merely confirming `.forUpdate()` compiles or that the generated SQL text contains the string
"FOR UPDATE". It matches exactly what the launch task asked to verify. I independently re-ran
this test standalone (isolated from the rest of the suite) -- 1/1 passed, in addition to its pass
inside the full 102-test run.

Verdict: sound. Closes CRITICAL-2.

### Spec Compliance Matrix

**Domain: money-rounding** (3 requirements, 6 scenarios -- unchanged, re-confirmed COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Single cent-rounding function | Half-cent rounds up | redondeo.test.ts | COMPLIANT |
| Single cent-rounding function | Percentage: no second rounding point | redondeo.test.ts | COMPLIANT |
| Allocation respects total | Sum of parts equals total | redondeo.test.ts (200-iteration property test) | COMPLIANT |
| Allocation respects total | Remainder order is caller-injected | redondeo.test.ts | COMPLIANT |
| Allocation respects total | Zero remainder leaves parts unchanged | redondeo.test.ts | COMPLIANT |
| Percentage: no repeat rounding over aggregate | Aggregate equals sum of rounded rows | redondeo.test.ts | COMPLIANT |

**Domain: operational-day** (3 requirements, 6 scenarios -- unchanged, re-confirmed COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| dia_operativo pivots 05:00 Lima | Sat 23:40 to Saturday | dia-operativo.test.ts | COMPLIANT |
| dia_operativo pivots 05:00 Lima | Sun 00:30 to Saturday | dia-operativo.test.ts | COMPLIANT |
| dia_operativo pivots 05:00 Lima | Sun 05:01 to Sunday | dia-operativo.test.ts | COMPLIANT |
| dia_operativo pivots 05:00 Lima | Exact 05:00 cutoff to new day | dia-operativo.test.ts | COMPLIANT |
| No gaps or overlaps | 04:59:59 vs 05:00:00 consecutive | dia-operativo.test.ts | COMPLIANT |
| Constant, not configurable | Result independent of config tables | dia-operativo.test.ts | COMPLIANT |

**Domain: vigencia-resolution** (1 requirement, 4 scenarios -- unchanged, re-confirmed COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Highest vigente_desde whose day arrived | Several past versions, highest chosen | vigencia.test.ts | COMPLIANT |
| Highest vigente_desde whose day arrived | Future version excluded despite matching calendar date | vigencia.test.ts | COMPLIANT |
| Highest vigente_desde whose day arrived | No applicable version returns sin_vigencia | vigencia.test.ts | COMPLIANT |
| Highest vigente_desde whose day arrived | Same-day disambiguation | vigencia.test.ts | COMPLIANT |

**Domain: data-access** (3 requirements, 4 scenarios -- all 4 now COMPLIANT, was 2/4)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Bound parameter for money/pct writes | Writing an amount uses a bound parameter | vigencia.test.ts (Kysely insertInto().values()) | COMPLIANT |
| Bound parameter for money/pct writes | No money-writing path bypasses the bound parameter | tests/unit/sin-sql-interpolado.test.ts | COMPLIANT (was CRITICAL/UNTESTED) |
| Spanish identifiers pass through unmapped | vigente_desde reaches the generated type unchanged | schema-types.test.ts, schema.d.ts | COMPLIANT |
| Row locking reachable, no escape hatch | A query can request row locking via the layer API | tests/integration/row-locking.test.ts | COMPLIANT (was CRITICAL/UNTESTED) |

**Domain: base-schema (MODIFIED)** (1 requirement, 4 scenarios -- unchanged, re-confirmed COMPLIANT)
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| vigente_desde rejects a past operational day at the DB level | Past operational day rejected | vigencia.test.ts | COMPLIANT |
| same requirement | Current/future accepted | vigencia.test.ts | COMPLIANT |
| same requirement | Comparison uses operational day, not calendar date | vigencia.test.ts | COMPLIANT |
| same requirement | Zero inserted rows breaks nothing | migrations.test.ts, schema_migrations bookkeeping | COMPLIANT |

**Compliance summary**: 24/24 scenarios compliant (was 22/24). 0 CRITICAL/UNTESTED remaining.

### Other 4 domains -- re-confirmed, not merely assumed

The 3 remediation commits touch only 2 new test files plus tasks.md (confirmed via
`git show --stat` on each). Zero lines changed in redondeo.ts, the migration SQL, vigencias.ts,
kysely.ts, context.ts, index.ts, ADR-0042, or TECH-DESIGN.md. The full 102-test run re-executed
every test file from all 5 domains in the same process, including redondeo.test.ts,
sin-redondeo-suelto.test.ts, dia-operativo.test.ts, vigencia.test.ts, schema-types.test.ts, and
the 4 wiring-only integration files -- all 90 pre-existing tests plus the 9 pre-existing-domain
tests unaffected by Phase 5 passed alongside the 9 new ones (8 + 1). Nothing about this
remediation could have silently broken the other domains, and the full-suite re-run confirms
that directly rather than by inference alone.

### Correctness (Static Evidence) -- new rows only (prior 15 rows unchanged, see prior report)
| Requirement | Status | Notes |
|---|---|---|
| Bound-parameter write-surface audit, data-access | Implemented | sin-sql-interpolado.test.ts, 3 regex patterns, 7-fixture self-test, real scan of src/server/** |
| Row-locking reachability, data-access | Implemented | row-locking.test.ts, 2-then-3 real PostgreSQL connections, genuine 55P03 blocking proof |

### Coherence (Design) -- unchanged from prior report, all 8 decisions still followed
(D2-C/D2-D, D2-E, D2-F, D2-G, D2-H, P1 trigger-over-CHECK, P2 codegen golden-test gate,
stacked-to-main chain strategy -- none of these were touched by Phase 5, re-confirmed by the
zero-diff scope shown above.)

### TDD Compliance
| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | Phase 5 table present in apply-progress, RED/GREEN/TRIANGULATE/SAFETY NET/REFACTOR all filled |
| All tasks have tests | Yes | 5.1 and 5.2 each map to their own new test file |
| RED confirmed, tests exist | Yes | Both files read directly this session |
| GREEN confirmed, tests pass | Yes | 102/102 full suite plus 2 independent standalone re-runs this session |
| Triangulation adequate | Yes / N-A | 5.1: 7 fixture cases (3 positive, 4 negative); 5.2: single scenario by nature (a lock either blocks or it does not) -- the RED-then-GREEN removal/restoration cycle is itself the triangulation proof for a concurrency test |
| Safety net for modified files | Yes | Both are new files; baseline (50/50, then 93/93) run before each per apply-progress, consistent with the observed diff (both are pure additions, no existing file modified) |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution (Phase 5 additions)
| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 8 | 1 | vitest, pure regex logic + real fs scan, no DB |
| Integration | 1 | 1 | vitest plus real PostgreSQL, 2 concurrent pg.Pool connections |

Combined with the prior 93: **Total 102 tests, 16 files.**

### Assertion Quality (Phase 5 files, scanned personally this session)
No banned patterns in either file. Neither has a tautology, an assertion outside a real
production-code call (sin-sql-interpolado calls the real `contieneSqlInterpolado` against the
real `src/server` tree; row-locking calls the real `.forUpdate()` codepath against real
PostgreSQL), a ghost loop, or smoke-test-only assertions -- row-locking asserts a specific
PostgreSQL error code (`55P03`) plus row-id equality, not merely "did not throw". Zero
`vi.mock()` calls in either file (both exercise real code against a real filesystem / real
database), well under any mock-heavy threshold.

**Assertion quality**: All assertions verify real behavior.

### Quality Metrics
**Linter**: Not available, no lint script/config detected
**Type Checker**: No errors, npm run typecheck, exit 0, independently re-run this session

### Issues Found

**CRITICAL**: None. Both prior findings are closed:
1. (Previously CRITICAL-1) "No money-writing path bypasses the bound parameter" -- closed by
   tests/unit/sin-sql-interpolado.test.ts, independently judged sound above.
2. (Previously CRITICAL-2) "Row locking is reachable with no escape hatch" -- closed by
   tests/integration/row-locking.test.ts, independently judged sound above.

**WARNING**: None.

**SUGGESTION**:
1. Consider adding a short code comment near `PATRONES_PROHIBIDOS` in
   sin-sql-interpolado.test.ts documenting the disclosed indirection-bypass limitation (a value
   assigned to a variable before being passed to `pool.query(variable)` is not caught by static
   regex) so a future maintainer extending the audit is aware of the boundary. Non-blocking,
   informational only -- identical limitation already exists, unremarked, in the accepted
   sin-redondeo-suelto.test.ts precedent.
2. (Carried forward from prior report, now resolved) apply-progress now records the full
   93-then-102 test-count progression across the merge and Phase 5 -- no further action needed.

### Verdict
PASS
Both prior CRITICAL findings are genuinely closed: sin-sql-interpolado.test.ts would catch
both example bypasses named in the launch task (pool.query with an interpolated template
literal, and sql.raw with an interpolated value), proven against its own fixtures before
trusting the zero-result scan; row-locking.test.ts proves genuine blocking behavior using two
independent, real PostgreSQL connections and a server-side error code (55P03), not merely that
.forUpdate() compiles. All 24/24 spec scenarios across all 5 domains are COMPLIANT with a
passing, independently re-run covering test. 33/33 tasks complete. npm test: 102/102 passed
(16 files). npm run typecheck: clean, exit 0. The other 4 domains are re-confirmed unaffected
by direct diff inspection (zero non-test-file changes in the 3 remediation commits) and by the
full-suite re-run. This change is archive-ready.
