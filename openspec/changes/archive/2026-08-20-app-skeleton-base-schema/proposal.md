# Proposal: Application Skeleton and Base Schema (`app-skeleton-base-schema`)

BACKLOG.md item **#1**. Depends on nothing; items #2, #3, #4 and #7 depend on it.

## Intent

The repository holds 37 ADRs, 312 acceptance criteria and zero lines of code. Nothing runs, so
nothing is verifiable and every later backlog item has nowhere to land. This change turns the
already-decided stack into a running single-origin application, a migration mechanism, and the
configuration tables the rest of the schema will hang off. Done means: a fresh clone installs,
migrates and boots, serving the four routes and the tRPC API from one origin against PostgreSQL.

## Scope

### In scope

- Node + tRPC backend that **also serves the built React SPA from the same origin** (ADR-0037).
  No separate front-end origin; the process exposes no cleartext port to any network.
- The four SPA routes `/estacion`, `/kds`, `/cocina`, `/admin` (ADR-0001) as placeholders —
  routing only, zero domain UI.
- One tRPC router wired end to end with an inferred-type client, plus **`Origin` validation on
  every mutation** (ADR-0033 §3, unchanged by ADR-0037). This is skeleton-level middleware and
  belongs here even though the mutations it will guard belong to #25.
- PostgreSQL (Neon) connectivity and a versioned, **forward-only** migration mechanism.
- Migrations creating the **configuration tables only, with no rows**: `ConfiguracionCostos`,
  `CalendarioApertura`, `ConfiguracionOperativa`. Money columns are integers in minor units
  (ADR-0011, ADR-0032); instants are `timestamptz`.
- Repository baseline: TypeScript config, `.gitignore`, build/serve scripts, linting.
- **Propagation (mandatory, not optional polish)**: the new skeleton criteria are written into
  `TECH-DESIGN.md` as `- [ ]` checkboxes — they stay the executable specification — not only into
  the change's delta spec. This carries into the spec and archive phases.

`ConfiguracionOperativa` is claimed for #1 on the strength of item #25's title, *"Calendarios,
costos y **parámetros**"*, and TECH-DESIGN line 189 (*"Editables desde la pantalla de parámetros"*):
its screen is #25's, so its table is #1's. The exploration flagged this ownership as inferred (§h);
this proposal states the inference rather than leaving it implicit.

### Out of scope — non-goals

| Deferred | Owner |
|---|---|
| **Seed rows of any kind**, and the bootstrap administrator | #3 |
| **Every configuration value**: `pct_igv`, `pct_comision`, `pct_merma`, salaries, indirect costs, `umbral_demora_min`, `inactividad_sesion_min`, `patron_semanal` | #25 |
| `dia_operativo()`, rounding, residue split, effective-date resolution | #2 |
| Configuration screens and effective-date rules | #25 |
| Auth, PIN, sessions, cookies, `Dispositivo` | #3, #5 |
| `EventoOperacion`, SSE stream | #4 |
| Every other domain entity (`Persona`, `Mesa`, `Cuenta`, `Comanda`, `Venta`, `Insumo`, …) | its own numbered item |

Two non-goals are load-bearing and must not be "helpfully" solved during apply:

1. **`creada_por` stays `NOT NULL`.** No synthetic/system author, no nullable column. The
   chicken-and-egg with SEC-08 is resolved by *sequencing* — rows arrive in #3 alongside the
   administrator ADR-0031 creates — not by weakening the constraint.
2. **No default value is invented for any parameter.** REVISION-ADVERSARIAL finding #15 stays open
   knowingly; inventing a plausible number here is precisely what that finding warns against.

A third is deleted rather than deferred: **CA generation, private-key custody, certificate renewal
and root-certificate distribution do not exist.** ADR-0037 replaced ADR-0033 §1; the hosting
platform terminates TLS with a public certificate.

## Capabilities

### New capabilities

- `app-skeleton`: single-origin runtime — backend serving the SPA, the four routes, tRPC transport,
  `Origin` validation, no cleartext port.
- `base-schema`: forward-only migration mechanism and the empty configuration tables.

### Modified capabilities

- None. `openspec/specs/` is empty; this is the first change.

## Approach

One deployable: a single Node process that mounts the tRPC HTTP handler and serves the SPA static
build, with unknown paths falling back to the SPA entry so the four routes resolve client-side.
Migrations are plain SQL files checked into git and applied as a start step. The schema translates
TECH-DESIGN's prose literally — it is prescriptive prose with no DDL anywhere, so this change is the
first place literal SQL types get chosen.

### The `vigente_desde` sequencing problem

The column is born here; the rule governing it is not. TECH-DESIGN line 797: *"`vigente_desde` de
`ConfiguracionCostos` y `CalendarioApertura` se compara contra el **día operativo en curso**, no
contra la fecha civil del servidor."* `dia_operativo()` is item #2's deliverable. A civil-date
`CHECK` would be exactly the bare `DATE(timestamp)` anti-pattern ADR-0028 forbids, and would be
wrong for five hours of every day.

**Proposed sequencing**: #1 creates `vigente_desde timestamptz NOT NULL` with **no temporal
constraint**; the forward-only rejection (ADR-0022) lands in #2 as a server-side rule expressed
through `dia_operativo()`. This is safe only because #1 ships no rows and no write path, so the
window in which the rule is absent is unreachable. The obligation must be recorded explicitly so #2
inherits it — an unrecorded gap here is the project's diagnosed failure mode.

## Affected areas

| Area | Impact | What changes |
|---|---|---|
| `package.json`, `tsconfig.json`, `.gitignore` | New | Repository baseline; none exist |
| `src/server/**` | New | Node entry, tRPC router, `Origin` middleware, static SPA serving |
| `src/client/**` | New | React SPA, four placeholder routes, typed tRPC client |
| `migrations/**` | New | Forward-only migrations; three empty configuration tables |
| `TECH-DESIGN.md` | Modified | New `- [ ]` skeleton criteria (Spanish, per language contract) |
| `BACKLOG.md` row #1 | Modified | Still reads *"TLS con CA propia del local"* and *"Generación y custodia de la CA"* — stale since ADR-0037 |
| `openspec/config.yaml` | Modified | Context block still reads *"TLS with a local internal CA"* — same staleness |

The last two rows are ADR-0037 propagation debt found while writing this proposal, not new scope.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Apply blocked: strict TDD is on and no test runner is chosen | High | Design phase must choose one with its own ADR + decisions-table row before tasks |
| An implementer fills an empty parameter with a plausible guess | Med | Named as an explicit non-goal above; finding #15 quoted |
| `vigente_desde` gets a civil-date `CHECK` (ADR-0028 violation) | Med | Sequencing stated above; #2 inherits the rule as a recorded obligation |
| Money column typed as `NUMERIC`, permitting silent fractional writes | Med | Integer type is a design decision, taken before migrations are authored |
| Skeleton criteria land only in the delta spec, not `TECH-DESIGN.md` | Med | In scope above; archive phase re-checks |

## Open decisions for `sdd-design` — not resolved here

1. **Test runner.** Unchosen and unconstrained by any ADR. Needs its own ADR plus a row in the
   TECH-DESIGN decisions table, per project convention. No `test_command` is invented here.
2. **Money SQL column type and width** — `INTEGER` vs `BIGINT`. The *representation* is decided
   (integers, minor units); the literal type is not. ADR-0003's `NUMERIC` mention was a capability
   that justified choosing PostgreSQL, not a mandated column type — not a contradiction.
3. **Local development without platform TLS.** ADR-0033 says the backend does not listen in
   cleartext; ADR-0037 §4 reads that *over the public interface*. What that means on a developer
   machine is unstated anywhere.
4. **Does #1 provision Render/Neon, or only run on that topology?** ADR-0037 decides where the
   system runs; nothing states whether item #1 must actually deploy.

## Rollback plan

This is the first change in an empty repository, so rollback is **deletion, not reversion** — there
is no prior behaviour to restore, no consumer to break, no data to migrate back.

- **Code**: revert the feature branch. The repository returns to docs-only, exactly commit `e6b0383`.
- **Database**: drop the schema. The tables are empty by construction — zero rows, nothing to
  preserve, no backup needed.
- **Migrations**: while no rows exist, forward-only migrations can be *replaced wholesale* rather
  than compensated. That freedom ends the moment #3 inserts the first row; after that, ADR-0022's
  forward-only discipline applies to schema history too.
- **Documents**: revert the new `TECH-DESIGN.md` checkboxes. **Keep** the `BACKLOG.md` and
  `openspec/config.yaml` corrections — they propagate ADR-0037 and are true whether or not this
  change ships.

## Dependencies

- ADR-0037 (hosting and single origin) — written and propagated; unblocks this item.
- A Render service and a Neon database, if #1 is required to actually deploy (see open decision 4).

## Success criteria

- [ ] A fresh clone installs, migrates and starts with documented commands.
- [ ] All four routes render from a single origin; no separate front-end origin exists.
- [ ] A tRPC procedure is callable from the SPA with end-to-end inferred types.
- [ ] Migrations run clean on an empty database and create the three configuration tables **with
      zero rows**.
- [ ] A mutation carrying a foreign `Origin` header is rejected server-side.
- [ ] The backend exposes no cleartext port.
- [ ] `TECH-DESIGN.md` carries the new skeleton criteria as `- [ ]` checkboxes.
