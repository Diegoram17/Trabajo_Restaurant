```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:7ba3cefe6e552a69cc6b2a9a0dd79f520a713d3b38e6a7086f1ee6ff147f53b5
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 14/14
scenarios: 20/20
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:7ba3cefe6e552a69cc6b2a9a0dd79f520a713d3b38e6a7086f1ee6ff147f53b5
build_command: npm run typecheck && npx tsc -p tsconfig.server.json --noEmit
build_exit_code: 0
build_output_hash: sha256:0a0f97b53780ab4d4eac079e24e6b245e81f130b30f408f5d2b26b2feadf58e2
```

## Verification Report

**Change**: app-skeleton-base-schema (BACKLOG #1)
**Version**: spec obs 37 / design obs 38 / tasks obs 40 / apply-progress obs 42
**Mode**: Strict TDD (Vitest, ADR-0038)
**Branch**: feat/item-1-app-skeleton, working tree clean, evidence gathered against commit fb32652 (HEAD).

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 33 |
| Tasks complete | 32 |
| Tasks incomplete | 1 (task 0.1, data-access layer decision, deliberately DEFERRED to backlog item #2 by user decision, recorded as an entry gate on BACKLOG row #2. Not a defect. Confirmed present in BACKLOG.md line 10.) |

### Build & Tests Execution — commands re-run live by this verification, not taken from apply-progress

**Typecheck (Bundler target)**: PASS - npm run typecheck -> exit 0
**Typecheck (NodeNext, server build target)**: PASS - npx tsc -p tsconfig.server.json --noEmit -> exit 0
```text
$ npm run typecheck && npx tsc -p tsconfig.server.json --noEmit
> tsc -p tsconfig.json --noEmit
(no output, exit 0 both)
```

**Tests, unit tier (no DB)**: PASS - npm run test:unit -> 4 files / 25 tests passed, exit 0
**Tests, full tier (real PostgreSQL 17.11 at 127.0.0.1:5432)**: PASS - npm test -> 9 files / 48 tests passed, exit 0
```text
$ npm test
> vitest run
> tsx scripts/migrate.ts   (global-setup subprocess)
No pending migrations.
 Test Files  9 passed (9)
      Tests  48 passed (48)
```
Ran twice independently during this verification; identical result both times (no flake observed).

**Coverage**: not available, no coverage tool configured in this project. Reported as skipped, not a failure.

### Live-database verification (independent of the test suite; queried trabajo_restaurant_test directly via psql as restaurant_app, no credentials echoed)

| Claim | Verified | Evidence |
|---|---|---|
| Money columns are integer | YES | `\d configuracion_costos`: salario_cocina, salario_administrativo, costos_indirectos_mensuales all integer |
| Percentage columns are integer | YES | same table: pct_comision, pct_merma, pct_igv all integer |
| No configuration parameter column carries a DEFAULT | YES | `\d` output for all 4 tables. The only DEFAULTs present are id (identity), creada_en (now(), a metadata timestamp, not a parameter), and fila_unica (true, the singleton-row PK marker). None are in the spec's excluded list. |
| vigente_desde carries no CHECK | YES | `\d` shows only UNIQUE (vigente_desde) on both configuracion_costos and calendario_apertura. No CHECK. Confirmed also via a pg_constraint query in the test suite. |
| creada_por is NOT NULL with no FK | YES | `\d` shows creada_por integer not null, no Foreign-key constraints section referencing it. A live INSERT with creada_por = NULL was attempted and rejected: ERROR: null value in column "creada_por" violates not-null constraint |
| ConfiguracionOperativa has no vigente_desde | YES | `\d configuracion_operativa`, columns are only fila_unica, umbral_demora_min, inactividad_sesion_min |
| All 4 tables hold zero rows | YES | live SELECT count(*) on all 4 tables returned 0, 0, 0, 0 |

**Additional live probe not requested but relevant** — reproduced test scenario 3.1(c) independently outside the suite:
- A raw SQL literal INSERT with VALUES (..., 100.5, ...) into salario_cocina does NOT error. PostgreSQL treats an unquoted numeric literal as type numeric and applies an implicit assignment cast to integer, which rounds (100.5 -> 101) rather than rejecting.
- The exact path the test suite and the real pg-driver application code use, a parameterized query ($1 bound to the JS number 150000.5), IS rejected: invalid input syntax for type integer: "150000.5", reproduced live, matching the test's assertion regex.
- So the "fractional write rejected" guarantee is real for every write path this codebase currently has or is designed to have (raw pg, per design D-E, is the only planned entry point), but it is a property of parameter binding, not of the column type in isolation. A hand-written raw-SQL admin script would silently round instead of reject. See WARNING-2 below.

### Spec Compliance Matrix

**Domain: app-skeleton**

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Single-Origin Serving | SPA and API share one origin | routes.test.ts (4 routes) + trpc.test.ts (real procedure) on the same createServer instance/port | COMPLIANT |
| Single-Origin Serving | No alternate front-end origin is configured | none — exhaustive static inspection | COMPLIANT via static evidence, not a dedicated runtime test: no `cors` dependency in package.json, no second `createServer`/proxy anywhere in src/, confirmed by reading index.ts in full and grepping the whole src/ tree for CORS/Access-Control. The codebase is small and fully read, so this absence claim is exhaustively checked, not sampled. |
| Four Placeholder Routes | Each route resolves | routes.test.ts it.each over the 4 routes, real Vite build | COMPLIANT |
| Four Placeholder Routes | Unknown paths fall back to the SPA | http-pipeline.test.ts "unknown path... falls back" | COMPLIANT |
| End-to-End Typed tRPC | A typed call succeeds | trpc.test.ts, real @trpc/client batch call, response type inferred from AppRouter | COMPLIANT |
| Origin Validation on Mutations | Matching origin accepted | trpc.test.ts + origin-guard.test.ts | COMPLIANT |
| Origin Validation on Mutations | Foreign origin rejected | trpc.test.ts (foreign + absent Origin, counter unchanged) + origin-guard.test.ts (suffix-lookalike case too) | COMPLIANT |
| No Cleartext Transport | Unencrypted request rejected, not redirected | transport.test.ts, loopback-only bind (ECONNREFUSED on LAN IP) + X-Forwarded-Proto: http -> 4xx never 3xx, no Location | COMPLIANT, and correctly scoped: the test file's own doc comment and README.md explicitly disclaim proving the platform edge's cleartext rejection at the public origin (ADR-0037 section 4); only the process's own loopback bind and refuse-not-redirect behavior are claimed. No over-claiming found. |
| Verifiable "Running" State | Fresh clone reaches a running state | manual — apply-progress task 6.2, project-designated as a manual runtime harness (tasks.md's own Work Unit 6 table: "Runtime harness: Manual fresh-clone run") | COMPLIANT via recorded manual runtime evidence, not a Vitest test. Apply-progress obs 42 documents a real, non-simulated run: rm -rf dist && npm run build from nothing, npm run migrate against the untouched dev DB (first real run, "Applied 1 migration(s)"), npm run start, and real curl against all 4 routes + /trpc/ping + /trpc/nope + /. This verification did not independently repeat that run (would require deleting node_modules/databases, out of scope for a non-destructive verify pass), but the recorded evidence is concrete command output, not a description, and the manual-verification path is explicitly the one tasks.md itself designated for this scenario. |
| TECH-DESIGN.md Propagation | Archive carries the criteria forward | doc-state check, not a test | COMPLIANT, verified directly: TECH-DESIGN.md line count of "- [ ] " = 327, matching state.yaml's tech_design_criteria: 327 total; the 10-line block added by commit fb32652 (lines 421-432) was read in full and matches this spec's requirements. See SUGGESTION-1 for a wording nuance in the requirement's own text. |

**Domain: base-schema**

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Forward-Applied, Versioned Migrations | Clean database migrates | migrations.test.ts (a) | COMPLIANT |
| Forward-Applied, Versioned Migrations | Re-running is a no-op | migrations.test.ts (b) | COMPLIANT |
| Configuration Tables Created Empty | Tables exist with zero rows | migrations.test.ts (a) + live psql count | COMPLIANT |
| Configuration Tables Created Empty | No column supplies a value on its own | migrations.test.ts (g) + live \d inspection | COMPLIANT |
| Money Columns as Integer Minor Units | Fractional write rejected as type mismatch | migrations.test.ts (c), reproduced independently | COMPLIANT (see WARNING-2 for the parameterized-vs-literal nuance) |
| Instant Columns as timestamptz | Column type is time-zone aware | migrations.test.ts (d) + live \d ("timestamp with time zone") | COMPLIANT |
| vigente_desde Ships Without a Temporal Constraint | No constraint exists yet | migrations.test.ts (e) + live \d/pg_constraint | COMPLIANT |
| vigente_desde Ships Without a Temporal Constraint | The absent rule is unreachable | none — exhaustive static + live inspection | COMPLIANT via static evidence: migration inserts 0 rows (live-confirmed), and grepping src/ and scripts/ for INSERT INTO configuracion_costos / calendario_apertura returns zero matches anywhere outside the empty migration file itself — no code path writes to these tables. |
| creada_por Stays NOT NULL | Column rejects a null author | migrations.test.ts (f) + live INSERT ... NULL rejected | COMPLIANT |
| TECH-DESIGN.md Propagation | Archive carries the criteria forward | doc-state check | COMPLIANT, same verification as above; creada_por NOT NULL criterion present at line 430. Two requirements from this spec were deliberately excluded from this propagation (vigente_desde no-temporal-constraint, and the FK-deferral half of creada_por), verified both are instead recorded as inherited obligations: BACKLOG.md row #2 ("Hereda del #1 una obligacion... vigente_desde sin restriccion temporal") and row #3 ("Hereda del #1 una segunda obligacion... creada_por... sin la clave foranea"). This matches the task brief's framing exactly, confirmed present, not merely asserted. |

**Compliance summary**: 20/20 scenarios compliant. 17/20 by a passing runtime-covering test; 3/20 by exhaustive static source inspection or by a recorded manual runtime-command transcript that tasks.md itself designated as the harness for that scenario (see the three annotated rows above). None of the 3 were taken on faith — each was independently re-verified during this pass (fresh grep across the whole src/scripts tree, or reading the actual apply-progress command transcript), not copied from the apply-progress report's own claim.

### Correctness (Static Evidence, implementation vs. design)
| Requirement | Status | Notes |
|---|---|---|
| Origin guard exact-match, no substring/suffix | Implemented | origin-guard.ts uses ===; origin-guard.test.ts proves the suffix-lookalike case explicitly |
| Static path containment | Implemented | static.ts resolves and checks startsWith(root + sep); static.test.ts covers literal .., percent-encoded, and nested-past-prefix traversal |
| Pipeline order: trpc never falls through to HTML | Implemented | http-pipeline.test.ts "/trpc/nope returns JSON, never HTML" |
| SPA fallback gated on Accept: text/html | Implemented | http-pipeline.test.ts "missing hashed asset returns 404, not HTML" |
| Migration runner forward-only, transactional, idempotent | Implemented | scripts/migrate.ts, per-file BEGIN/COMMIT/ROLLBACK, schema_migrations bookkeeping; no down file or verb exists |
| .env loading present (was a known gap flagged mid-apply) | Implemented | loadDotEnv() in env.ts, called from global-setup.ts and migrate.ts; confirmed npm run migrate picks up DATABASE_URL from .env |
| 5 ADRs (0037-0041) exist for the 5 open design decisions (D1-D3, identifier language, hosting) | Implemented | adrs/0037... through adrs/0041... all present; no decision found settled silently without one |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D-A: Origin guard is a single HTTP-layer chokepoint | Yes | Called once in index.ts, not per-procedure |
| D-B: Vite builds SPA, tsc builds server | Yes | vite.build.config.ts + tsconfig.server.json, npm run build runs both |
| D-C: SPA fallback conditioned on Accept: text/html | Yes | acceptsHtml() gate before serveSpaEntry |
| D-D: Static serving resolves against build root, rejects escapes | Yes | resolveStaticPath |
| D-E: Raw pg, no ORM, deferred to #7 | Yes | Only pg.Pool used; no query-builder/ORM dependency in package.json; deferral recorded on BACKLOG row #2 |
| Pipeline step order: origin guard is step 1 | Minor deviation | handleRequest in src/server/index.ts checks isForwardedCleartext() before checkOrigin(). The design's "Runtime Shape" diagram lists the origin guard as step 1 of 5 and does not itemize the forwarded-proto check as a numbered step. Functionally harmless (a cleartext-forwarded request is rejected regardless of Origin), but it is an unacknowledged ordering deviation from the stated diagram, see WARNING-3. |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. apply-progress (obs 42) no longer contains the granular "TDD Cycle Evidence" table for Phases 1-5 that strict-tdd-verify.md's Step 5a expects to mechanically cross-reference (RED/GREEN/TRIANGULATE/SAFETY-NET columns per task). The artifact's own text says this content "is not repeated here in full; see that observation's history," but mem_get_observation only returns the current (6th) revision — prior revisions were not retrievable by this agent. Mitigation performed: this verification substituted direct inspection — every test file listed in tasks.md Phases 2-5 was read and confirmed to (a) exist, (b) pass on live execution, (c) contain multiple non-trivial, behavior-asserting test cases (no tautologies, no ghost loops, no assertion-free tests found across env.test.ts, origin-guard.test.ts, static.test.ts, migrate-ordering.test.ts, migrations.test.ts, http-pipeline.test.ts, routes.test.ts, trpc.test.ts, transport.test.ts). TDD compliance is judged substantively satisfied, but the mechanical artifact-based check the skill calls for could not be run as designed — flagging the retrievability gap itself as process hygiene for future changes.
2. Money-column fractional-write rejection is a property of the write path, not of the column type alone. Confirmed live: a bound/parameterized pg query with a fractional value is rejected (invalid input syntax for type integer), this is what the test suite and any real application code exercise. A raw SQL literal (e.g. VALUES (..., 100.5, ...)) in the same schema is NOT rejected — PostgreSQL's implicit numeric -> integer assignment cast rounds it instead (100.5 -> 101), reproduced live against trabajo_restaurant_test. Every planned write path (pg driver, per design D-E) is protected; a future hand-written migration or admin script using literal SQL would not be. Not a defect in item #1 (nothing here writes raw literals), but worth a note for whoever authors item #25's seed inserts.
3. Pipeline ordering deviation: isForwardedCleartext() runs before checkOrigin() in src/server/index.ts, ahead of the design's documented step-1 origin guard. Harmless, undocumented.
4. 3 of 20 spec scenarios are proven by exhaustive static source inspection or by a recorded manual command transcript rather than by an automated Vitest test (see the three annotated rows in the Spec Compliance Matrix). This verification independently re-checked all three rather than trusting the apply-progress report's own claim, and judges them genuinely satisfied — but they remain a category apart from the other 17, which have a live-executed, still-passing automated test. Flagged for visibility, not as a functional gap.

**SUGGESTION**:
1. The base-schema and app-skeleton "TECH-DESIGN.md Propagation" requirement text reads literally as "a matching checkbox... for each requirement above" — i.e. all 7 per domain, no exceptions. In practice, 2 requirements were deliberately excluded (per the task brief's own framing, correctly recorded on BACKLOG rows #2/#3). This is not a functional gap, it is the right call, but the spec's own wording doesn't carve out the exception it now has to make. A future spec for a similar transitional item could phrase this requirement to allow explicitly-recorded deferrals up front, avoiding the same tension.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Partial | Present in apply-progress history per its own text, but not retrievable in the current revision (see WARNING-1) |
| All tasks have tests | Yes | Every Phase 2-5 GREEN task has a corresponding test file, confirmed by direct read |
| RED confirmed (tests exist) | Yes | 9/9 test files exist and were read in full |
| GREEN confirmed (tests pass) | Yes | 9/9 test files pass on live re-execution (48/48 tests, this pass, twice) |
| Triangulation adequate | Yes | Multi-case tests throughout (e.g. origin-guard.test.ts 7 cases, static.test.ts 6 cases, migrate-ordering.test.ts 6 cases), no single-assertion behaviors found |
| Safety Net for modified files | Not verifiable | No modified (pre-existing) files in this change, it is a from-scratch bootstrap |

**TDD Compliance**: 4/5 checks fully passed, 1 partial (artifact retrievability, not a code defect)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 25 | 4 | Vitest, no DB/socket |
| Integration | 23 | 5 | Vitest + real PostgreSQL 17.11 + real HTTP sockets + @trpc/client |
| E2E | 0 | 0 | Not installed, design explicitly chose no E2E tool (no domain UI exists yet) |
| **Total** | **48** | **9** | |

---

### Assertion Quality
**Assertion quality**: All assertions verify real behavior. No tautologies, no ghost loops, no assertion-free tests, no smoke-test-only patterns found across all 9 test files read in full during this verification.

---

### Quality Metrics
**Linter**: Not available — no lint script/config found in package.json
**Type Checker**: No errors on either target (Bundler and NodeNext/server), both re-run live by this verification

### Verdict
**PASS WITH WARNINGS** — Zero CRITICAL findings. All 14 spec requirements and all 20 scenarios are compliant; 17/20 scenarios are proven by a passing runtime test, 3/20 by exhaustive static inspection or a recorded manual runtime transcript that the project's own tasks.md designated as that scenario's harness (not a gap this agent excused on its own authority). Both deliberate non-defects called out in the task brief (task 0.1 deferral, the 2 excluded TECH-DESIGN criteria) were independently confirmed present and correctly recorded, not merely asserted. The transport requirement is correctly scoped and does not over-claim the platform edge's responsibility. 4 WARNING-level findings and 1 SUGGESTION are recorded for the orchestrator's attention — none block archive, but WARNING-1 (TDD evidence table retrievability) and WARNING-4 (evidence-type split across scenarios) are worth a human glance before archiving, per "a rubber-stamp pass is worse than a failure."
