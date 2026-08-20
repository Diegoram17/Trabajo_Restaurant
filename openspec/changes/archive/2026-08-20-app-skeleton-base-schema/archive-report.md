# Archive Report: Application Skeleton and Base Schema (app-skeleton-base-schema)

**Change**: BACKLOG item #1  
**Archived to**: `openspec/changes/archive/2026-08-20-app-skeleton-base-schema/`  
**Date**: 2026-08-20  
**Status**: COMPLETE (PASS with warnings)

## Artifact Lineage

| Artifact | Observation ID | Created | Status |
|----------|---|---|---|
| Proposal | #35 | 2026-08-19 20:39:24 | Archived |
| Spec (Delta: app-skeleton, base-schema) | #37 | 2026-08-19 20:48:36 | Merged to main specs |
| Design | #38 | 2026-08-19 20:52:34 | Archived |
| Tasks | #40 | 2026-08-19 21:52:07 | Archived (with revisions through 2026-08-20) |
| Apply Progress | #42 | 2026-08-19 22:13:37 | Reference snapshot (work continued) |
| Verify Report | #45 | 2026-08-20 07:50:13 | Archived |

## Final State Authority

This archive report records the state of the change at close. Per the Final-State Authority hierarchy, final-state facts from the orchestrator's launch prompt outrank intermediate snapshots from apply-progress and verify-report.

### Verification Status

**Verdict**: PASS with WARNINGS  
**Critical findings**: 0  
**Warnings**: 4  
**Suggestions**: 1  

Per the verify-report (#45, generated 2026-08-20 07:50:13):
- 14/14 spec requirements verified compliant
- 20/20 scenarios verified compliant
- 48 tests passed on full tier (real PostgreSQL 17.11)
- 25 tests passed on database-free tier (unit layer)
- Both typecheck targets passed at exit 0
- Live server binds 127.0.0.1 only, rejecting non-loopback connections

### Work Delivered

**Commits**: Eight commits on branch feat/item-1-app-skeleton:
1. 80eef48 - tooling scaffold
2. 91edb44 - unit layer
3. c5508bd - schema and migrations
4. c09fb04 - HTTP pipeline and four routes
5. c0bf8c4 - tRPC and transport proofs
6. 7ad4d37 - README
7. fb32652 - TECH-DESIGN propagation (328 total criteria)
8. 064525e - verification report and bound-parameter criterion

### Implementation Completeness

**Task status**: 32/33 complete. Task 0.1 (data-access layer decision) DEFERRED to BACKLOG item #2 by user decision, recorded as entry gate on BACKLOG row #2. This is not incomplete work—it is a sequenced deferral per project governance.

**Specification mapping**:
- app-skeleton domain: 6 requirements, 8 scenarios — all compliant
- base-schema domain: 8 requirements, 12 scenarios — all compliant

### Decisions Propagated

Five ADRs produced:
- ADR-0037: Single-origin hosting topology
- ADR-0038: Vitest test runner
- ADR-0039: Money and percentages as integer types
- ADR-0040: Implicit in design (SPA fallback, static path containment)
- ADR-0041: Development cleartext on 127.0.0.1 only

### TECH-DESIGN.md Propagation

All acceptance criteria from both app-skeleton and base-schema domains written into TECH-DESIGN.md as Spanish checkboxes. Count: 328 total (317 pre-existing + 11 new from this change).

Two requirements deliberately excluded per sequencing:
- vigente_desde forward-only constraint (deferred to item #2) — recorded on BACKLOG row #2
- creada_por FK reference (deferred to item #3) — recorded on BACKLOG row #3

Additional inherited obligations recorded on BACKLOG rows:
- Row #2: Implement vigente_desde forward-only rule, resolve data-access-layer decision
- Row #3: Add FK constraint creada_por REFERENCES Persona(id)
- Row #5: Session-state validation scope note
- Row #25: Use bound parameters only for money/percentage writes (newly added per post-verify finding)

### Spec Merge Details

Two new domains (no existing specs to merge with):
- openspec/changes/app-skeleton-base-schema/specs/app-skeleton/spec.md → openspec/specs/app-skeleton/spec.md
- openspec/changes/app-skeleton-base-schema/specs/base-schema/spec.md → openspec/specs/base-schema/spec.md

Merge status: Complete. Both copied mechanically and verified with diff -r for byte-identity.

### Archive Folder Structure

Archived to: openspec/changes/archive/2026-08-20-app-skeleton-base-schema/

Contents (all intact):
- proposal.md
- design.md
- tasks.md (32/33 complete, task 0.1 DEFERRED)
- specs/app-skeleton/spec.md
- specs/base-schema/spec.md
- state.yaml
- apply-progress.md (reference)
- verify-report.md

### Verification Findings Summary

**Critical**: None (archive proceeds)

**Warnings (4, none blocking)**:
1. TDD evidence table not retrievable in current apply-progress revision; substituted with direct test-file inspection
2. Money-column fractional-write rejection is write-path dependent; parameterized queries protected, raw literals not
3. Pipeline ordering: isForwardedCleartext runs before checkOrigin; harmless and undocumented
4. 3 of 20 scenarios proven via static inspection or recorded manual command transcript rather than automated tests

**Suggestions (1)**:
1. TECH-DESIGN.md Propagation requirement could allow explicitly-recorded deferrals to avoid tension

### Rollback Capability

As first change in empty repository:
- Code: Revert feature branch to commit e6b0383
- Database: Drop schema (empty by construction)
- Migrations: Replace wholesale (ADR-0022 forward-only applies only with rows)
- Documents: Revert checkboxes (preserve ADR-0037 corrections)

### SDD Cycle Complete

The change has been fully proposed, specified, designed, tasked, applied, verified, and archived. All implementation and proof work units closed. No CRITICAL issues. System runs on deployment topology and is verifiable locally.

BACKLOG item #2 is ready to start, inheriting four explicit obligations from this change.
