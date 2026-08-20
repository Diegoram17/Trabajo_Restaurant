# Base Schema Specification

## Purpose

Defines the forward-applied migration mechanism and the three configuration tables it creates —
`ConfiguracionCostos`, `CalendarioApertura`, `ConfiguracionOperativa` — with zero rows and zero
invented values. Schema shape only; no configuration value, no seed row, and no
`dia_operativo()`-based temporal rule belongs to item #1.

## Requirements

### Requirement: Forward-Applied, Versioned Migrations

Migrations MUST be plain, versioned files applied in order against PostgreSQL. Re-running the
migration step on an already-migrated database MUST be safe — it MUST NOT error and MUST NOT
duplicate or alter existing schema objects.

#### Scenario: Clean database migrates
- GIVEN an empty PostgreSQL database
- WHEN the migration command runs
- THEN it applies every migration in version order and exits successfully

#### Scenario: Re-running migrations is a no-op
- GIVEN a database already migrated to the latest version
- WHEN the migration command runs again
- THEN it makes no schema change and does not error

### Requirement: Configuration Tables Created Empty

Migrations MUST create `ConfiguracionCostos`, `CalendarioApertura`, and `ConfiguracionOperativa`.
No migration MAY insert any row into these tables, and no column MAY carry a database-level
`DEFAULT` that supplies a value for `pct_igv`, `pct_comision`, `pct_merma`, salaries, indirect
costs, `umbral_demora_min`, `inactividad_sesion_min`, or `patron_semanal`. Those values are item
#25's responsibility, not item #1's.

#### Scenario: Tables exist with zero rows
- GIVEN a freshly migrated database
- WHEN each of the three configuration tables is queried
- THEN each returns zero rows

#### Scenario: No column supplies a value on its own
- GIVEN the migrated schema
- WHEN the column definitions are inspected
- THEN no value-bearing column carries a `DEFAULT` that would populate it without an explicit insert

### Requirement: Money Columns as Integer Minor Units

Every money-bearing column in `ConfiguracionCostos` (salaries, indirect costs) MUST be an integer
type storing the minor currency unit. No money column MAY use a floating-point or unconstrained
decimal type that permits a fractional-cent write (ADR-0011, ADR-0032).

#### Scenario: A fractional write is rejected by the column type
- GIVEN the migrated `ConfiguracionCostos` table
- WHEN a value carrying a fractional minor unit is inserted into a money column
- THEN the database rejects it as a type mismatch, not merely a warning

### Requirement: Instant Columns as `timestamptz`

`vigente_desde` and `creada_en` on `ConfiguracionCostos` and `CalendarioApertura` MUST be
`timestamptz`, never a bare date or a naive timestamp without time zone.

#### Scenario: Column type is time-zone aware
- GIVEN the migrated schema
- WHEN the type of `vigente_desde` and `creada_en` is inspected
- THEN both are `timestamptz`

### Requirement: `vigente_desde` Ships Without a Temporal Constraint

`vigente_desde` on `ConfiguracionCostos` and `CalendarioApertura` MUST be `timestamptz NOT NULL`
with **no** `CHECK` or trigger comparing it to any date. The forward-only rejection against
`dia_operativo()` (ADR-0022, ADR-0028) is out of scope here and belongs to item #2. This is safe
only because item #1 inserts no row into either table and ships no write path that could exercise
the missing rule; a bare `DATE(timestamp)` `CHECK` here would itself be the anti-pattern ADR-0028
forbids, and would be wrong for five hours of every operational day.

#### Scenario: No constraint exists yet
- GIVEN the migrated schema
- WHEN the constraints on `vigente_desde` are inspected
- THEN only `NOT NULL` is present — no date or day-boundary check exists

#### Scenario: The absent rule is unreachable
- GIVEN item #1 ships no row and no mutation touching these tables
- WHEN the schema is reviewed for exploitable gaps
- THEN there is no write path through which a past `vigente_desde` could be persisted

### Requirement: `creada_por` Stays NOT NULL

`creada_por` on `ConfiguracionCostos` and `CalendarioApertura` MUST be `NOT NULL`, with no default
and no synthetic system author. Because item #1 inserts no row, this constraint is never exercised
until item #3 supplies real `Persona` rows to reference.

#### Scenario: Column rejects a null author
- GIVEN the migrated schema
- WHEN a row is attempted with a null `creada_por`
- THEN the insert is rejected by the `NOT NULL` constraint

### Requirement: TECH-DESIGN.md Propagation

Every acceptance criterion this spec adds MUST also be written into `TECH-DESIGN.md` as a Spanish
`- [ ]` checkbox before the change is archived.

#### Scenario: Archive carries the criteria forward
- GIVEN this spec's requirements are implemented and verified
- WHEN the change is archived
- THEN `TECH-DESIGN.md` contains a matching `- [ ]` checkbox, in Spanish, for each requirement above
