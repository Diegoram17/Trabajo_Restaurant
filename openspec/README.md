# SDD artifact store (mirror)

Persistence mode for this project is **hybrid**:

| Store | Holds | Role |
|---|---|---|
| Engram | `sdd/{change-name}/{artifact-type}` topic keys | Live SDD state. Survives compaction. Wins on divergence. |
| `openspec/` (this tree) | proposal, specs, design, tasks, verify report, archive | Git-visible mirror of that state, so the change is reviewable in a diff and the native SDD dispatcher can read it. |
| `PRD.md`, `TECH-DESIGN.md`, `adrs/` (repo root) | Product and technical authority | **Neither store above outranks these.** They are the delivered decision record. |

Rules that keep the two stores from becoming two truths:

1. Write Engram first, mirror here in the same phase. A phase is not done until both exist.
2. If they disagree, Engram is the state and this tree is re-synced from it — never the reverse.
3. Merging a delta spec into `openspec/specs/` never replaces updating `TECH-DESIGN.md` and `adrs/`.
   Specs are scaffolding; the root documents are the deliverable.

One change folder per `BACKLOG.md` item. Layout is the shared OpenSpec convention.
