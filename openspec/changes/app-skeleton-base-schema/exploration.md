# Exploration: BACKLOG #1 — Esqueleto de aplicación y esquema base

> Mirror of Engram `sdd/app-skeleton-base-schema/explore` (observation 32). Engram is the live
> state; if the two diverge, this file is regenerated from Engram, never the reverse.

Greenfield repository, no code exists yet. This explores what the already-written design
(TECH-DESIGN.md, adrs/, PRD.md, BACKLOG.md — in that authority order) demands of the first
executable slice: Node + tRPC backend, React SPA with `/estacion` `/kds` `/cocina` `/admin`,
PostgreSQL, migrations, seeded configuration entities, and TLS with a local CA (ADR-0033) where the
backend never listens in cleartext.

## 1. Acceptance criteria in scope

TECH-DESIGN.md has 307 `- [ ]` checkboxes. None of them address the skeleton itself — no checkbox
anywhere asserts "the four routes render," "tRPC is wired," or "migrations run." The only block that
touches item #1 at all is **"Transporte cifrado y atributos de sesión (ADR-0033)"** (TECH-DESIGN.md
lines 398-406), and most of its seven bullets are gated by entities/flows that do not exist until
later items:

- **In scope, unambiguously**: *"Todo el tráfico va sobre TLS, incluido el canal SSE. El backend **no
  escucha en claro**: una petición HTTP no se redirige, se rechaza — una redirección deja la primera
  petición viajando con su cookie adentro."* Pure transport behavior, no dependency on
  Persona/Dispositivo existing.
- **Partially in scope**: *"El certificado lo emite una CA propia del local, y su certificado raíz se
  instala en las 5 pantallas como parte del mismo procedimiento de enrolamiento del dispositivo."*
  Issuing a CA-signed cert for the backend is #1's job; installing the root cert "as part of the
  enrollment procedure" is item #3's job (`Dispositivo` does not exist yet).
- **Ambiguously in scope**: *"Toda mutación tRPC valida la cabecera `Origin`..."* — skeleton-level
  middleware could be wired in #1, but every example the AC gives (`ConfiguracionCostos` /
  `CalendarioApertura` writes) belongs to item #25.
- **Out of scope for #1**: the two cookie-attribute bullets (need item #3's cookies), the
  traffic-capture bullet (needs login/cobro/stream), and the "write from another origin is rejected"
  bullet (needs #25's mutations).

**Honest conclusion**: item #1 is close to acceptance-criteria-free by TECH-DESIGN's own checklist.
The spec never wrote a "done" bar for the skeleton beyond the single TLS/cleartext-rejection
sentence.

## 2. Schema surface

TECH-DESIGN.md's data model never states literal SQL column types for any field — it is prescriptive
prose ("enteros en unidad mínima," "timestamptz," "lista blanca"), no DDL.

**Entities BACKLOG's dependency graph puts elsewhere** (everything not listed below is explicitly
owned by a later row): `Persona`/`Dispositivo`/`CredencialCocina` -> #3; `Turno` -> #6;
`HorarioProgramado` -> #24; `ServicioCocina` -> #11; `Categoria`/`Insumo`/`Plato`/`RecetaInsumo` ->
#7; `Combo`/`ComboItem` -> #8; `Compra`/`MovimientoInventario` -> #9; `Merma`/`IncidenciaStock` ->
#26; `Mesa`/`Cuenta` -> #12; `Comanda`/`ItemComanda` -> #13; `EventoOperacion` -> #4;
`Venta`/`ItemVenta`/`Pago`/`Propina`/`Comision`/`Comprobante` -> #19; `CierreTurno` -> #21;
`LiquidacionPropina` -> #23.

That leaves only the **configuration entities** for #1, per BACKLOG's "Decisiones de despiece":
*"Igual con las entidades de configuración: nacen sembradas en #1, y sus pantallas y reglas de
vigencia son #25."* Item #25's scope line names `CalendarioApertura` and `ConfiguracionCostos`
explicitly. `ConfiguracionOperativa` is grouped with them under TECH-DESIGN's "Identidad y
configuración" heading but **no backlog item explicitly claims it** — inferred, not stated (§6h).

**Invariants that constrain this narrow surface:**

- **Money as integer minor units (ADR-0011/0032)**: money columns on `ConfiguracionCostos` (salarios
  flat, costos indirectos mensuales) must be integer type. Tension with ADR-0003 in §6e.
- **No stock column / append-only ledgers (ADR-0005)**: not exercised by #1's actual tables — the
  constraint exists for #7/#9's future extension of this schema.
- **No persisted per-unit ingredient cost (ADR-0032)**: same, not exercised in #1.
- **`vigente_desde` moves forward only (ADR-0022)**: directly relevant — both seeded entities carry
  it. TECH-DESIGN is explicit (line 788): *"`vigente_desde` de `ConfiguracionCostos` y
  `CalendarioApertura` se compara contra el **día operativo en curso**, no contra la fecha civil del
  servidor."* `dia_operativo()` is item #2's deliverable — see §6c.
- **`estado` whitelist (ADR-0027)**: applies to `Cuenta.estado` (#12). Neither seeded entity has an
  `estado` column, so item #1 has no state-machine column to apply this to.
- **Mandatory authorship (SEC-08)**: both entities require non-optional `creada_por`/`creada_en`.
  `creada_por` presumably FKs `Persona`, which does not exist until item #3 — chicken-and-egg
  detailed in §6b.

## 3. Seeded configuration entities

- **`pct_comision`** — 5%, explicit (PRD.md: *"comisión del 5% sobre la venta neta (sin IGV)
  cobrada"*; ADR-0032).
- **`pct_igv`** — 18%, explicit (PRD.md: *"IGV del 18% y moneda única (PEN)"*; ADR-0032).
- **`pct_merma`** — **no number anywhere in the corpus.** Every mention describes it as "% flat de
  merma estimada" without a figure.
- **Salarios flat (cocina, administrativos), costos indirectos mensuales** — no default anywhere;
  inherently business-specific.
- **`CalendarioApertura.patron_semanal`/`excepciones[]`** — no default anywhere, and it is the
  divisor of the entire *estado de resultados* (ADR-0021). TECH-DESIGN's own risks section names the
  exact failure mode: *"El calendario de apertura mal cargado desplaza toda la utilidad, en
  silencio... Los totales del mes siguen cerrando, así que el error no se delata por ningún lado."*
- **`ConfiguracionOperativa.umbral_demora_min`/`inactividad_sesion_min`** — TECH-DESIGN says outright
  these *"siguen sin valor definido."* REVISION-ADVERSARIAL.md finding **#15 is still open** (`[ ]`):
  *"hace falta un valor por defecto **elegido y argumentado**, no un campo vacío que el primer
  implementador va a llenar con lo que le parezca."*
- **`creada_por`** on both entities — cannot be populated with a real author before item #3 exists
  (§6b).

## 4. TLS and the local CA — the sharpest part of this exploration

ADR-0033 is unambiguous about the **mechanism**: all traffic over TLS including SSE, cleartext
rejected not redirected, cert issued by a CA the local business owns, root cert installed on the 5
screens during device enrollment (item #3), `Origin` validated on every mutation as defense in depth.

But ADR-0033's own **Consecuencias** section declares, in its own words, exactly the
custody/generation gap BACKLOG's row #1 flags as risk (*"Generación y custodia de la CA"*):

- *"La clave privada de la CA es un secreto nuevo, y es el más fuerte del sistema... No vive en la
  base de datos ni tiene rotación definida acá."* — does not say where it *does* live.
- *"Un certificado vencido deja el local sin sistema... y no existe ninguna alarma en el sistema que
  la anticipe."*
- *"No cierra el hallazgo #16 completo. Sigue sin haber decisión de empaquetado, entrega ni
  versionado del despliegue."*

That hallazgo #16 is REVISION-ADVERSARIAL.md's — **still open** (`[ ]`): *"No existe ninguna decisión
de despliegue, y dos ADRs dependen de ella."* SECURITY-REPORT.md (lines 1094-1096) traces the causal
chain directly: *"El hallazgo #16 de esa revisión... es la causa raíz de SEC-01. Este reporte no lo
redescubre: le da la consecuencia de seguridad concreta."* SEC-01 is marked resolved by ADR-0033; its
declared root cause is not.

**Concretely for item #1**: nothing says who or what generates the CA key pair, at what point in
setup, where the private key and root cert live on disk, whether that path is excluded from version
control, or how the cleartext-rejection criterion is meant to be exercised locally, since no dev/prod
environment distinction exists anywhere in the corpus. The project explicitly has no real deployment
(*"Trabajo académico, sin despliegue real"*), which makes the CA a genuinely unscaffolded decision,
not one this exploration can safely infer.

## 5. Test runner decision

No test runner or framework is named anywhere in PRD.md, TECH-DESIGN.md, or the 36 ADRs (grepped
`vitest`, `jest`, `node:test`, `playwright`, "framework de pruebas" — zero hits). This item is where
that choice gets made; it is not made yet, and this exploration does not choose it. Indirect pressure
from accepted ADRs:

- **TypeScript end-to-end (ADR-0002)** — no second toolchain a one-person team has to maintain.
- **PostgreSQL row-level locking is load-bearing (ADR-0003/0007/0030)** — ADR-0003 rejected SQLite
  specifically for lacking `SELECT ... FOR UPDATE`; the FIFO/concurrency guarantees this project's
  "diferencia 0" criteria depend on cannot be verified against a mock or in-memory substitute,
  implying integration tests against real Postgres are structurally necessary, not optional.
- **tRPC contract (ADR-0010)** — favors in-process procedure calls over HTTP-only testing.
- Strict TDD is session-level policy, external to the design corpus, raising the stakes without
  supplying the choice.

Per this project's own ADR convention, a runner choice made without its own ADR and TECH-DESIGN table
row would itself become an instance of the diagnosed dominant failure mode ("no propagar lo
decidido").

## 6. Open questions and tensions

a. **"Entidades de configuración sembradas" in #1 vs. ADR-0031's "la migración inicial crea un
   administrador y nada más."** Both can be literally true only if "la migración inicial" in ADR-0031
   refers narrowly to item #3's own migration layered on #1's — nothing states that reading
   explicitly.

b. **Mandatory `creada_por` (SEC-08) vs. no `Persona` existing yet.** If #1 inserts seed rows into
   `ConfiguracionCostos`/`CalendarioApertura`, `creada_por` cannot point at a real person (item #3
   has not run). If #1 only creates empty tables, that is a narrower reading of "sembradas" than
   BACKLOG's prose suggests. Unresolved.

c. **`vigente_desde`'s governing function does not exist when its column does.** TECH-DESIGN requires
   the comparison to use `dia_operativo()`, which is item #2's deliverable (which itself depends on
   #1). A naive civil-date `CHECK` would be exactly the *"`DATE(timestamp)` suelto"* anti-pattern the
   project forbids elsewhere.

d. **`ConfiguracionOperativa`'s missing defaults are a live, unchecked review finding**, not a quiet
   gap — REVISION-ADVERSARIAL #15 explicitly rejects the guess an implementer would be tempted to
   make here.

e. **ADR-0003's stated rationale for money storage (`NUMERIC` de precisión arbitraria) sits against
   ADR-0011/0032's adopted representation** (integers in minimum units, computed and rounded in
   application logic). TECH-DESIGN never states a literal column type either way; whether item #1's
   money columns should be `BIGINT`/`INTEGER` or `NUMERIC` is unreconciled in the documents.

f. **The TLS/CA gap is corroborated by three independently-authored documents** (ADR-0033's own
   consequences, REVISION-ADVERSARIAL #16, SECURITY-REPORT's SEC-01 root-cause note) — not just
   BACKLOG's one-line risk flag.

g. **TECH-DESIGN's 307 acceptance criteria are almost silent on item #1 itself** (§1).

h. **Which entities count as "the" configuration entities is never enumerated.** TECH-DESIGN's
   "Identidad y configuración" heading groups nine entities without marking which belong to #1 vs.
   later items; only #25's scope line narrows it, and only to two of the nine.

i. **Test runner**: genuinely open, unconstrained beyond §5's indirect pressures, deliberately not
   resolved here.

## Sources consulted

TECH-DESIGN.md (full), PRD.md (full), BACKLOG.md (full), REVISION-ADVERSARIAL.md (full),
SECURITY-REPORT.md (targeted), adrs/0001, 0002, 0003, 0010, 0011, 0028, 0030, 0031, 0032, 0033 (full
text each). No project skill targets exploration.

## Orchestrator gate

Four load-bearing claims were re-verified against the sources before this mirror was written:

| Claim | Verified against |
|---|---|
| REVISION-ADVERSARIAL findings #15 and #16 are still open | `REVISION-ADVERSARIAL.md:605` and `:627`, both `[ ]` |
| `pct_merma` has no value anywhere in the corpus | 7 mentions across PRD/TECH-DESIGN/adrs, none with a figure |
| `vigente_desde` compares against the operational day | `TECH-DESIGN.md:788`, verbatim |
| ADR-0003 cites `NUMERIC` arbitrary precision | `adrs/0003-eleccion-de-base-de-datos.md:34` |

One refinement on §6e: ADR-0003 cites `NUMERIC` as a **capability that justified choosing
PostgreSQL**, not as a mandated column type, and ADR-0011/0032 are the later governing decision. The
representation is therefore decided — integers in minor units — and what is genuinely missing is the
literal column type and width, which no document states.
