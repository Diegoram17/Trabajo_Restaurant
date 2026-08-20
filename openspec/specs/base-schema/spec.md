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

### Requirement: `vigente_desde` Rejects a Past Operational Day at the Database Level

`vigente_desde` in `configuracion_costos` and `calendario_apertura` MUST be `timestamptz NOT NULL`
and MUST be rejected by the database — not only by the application — when its operational day,
`dia_operativo(vigente_desde)`, is earlier than the current operational day,
`dia_operativo(now())` (ADR-0022, refined by ADR-0028). The comparison MUST use `dia_operativo()`
on both sides; it MUST NOT compare `vigente_desde`'s raw calendar date nor the server's calendar
date.

#### Scenario: A `vigente_desde` on an operational day earlier than the current one is rejected
- GIVEN a database migrated with this item applied
- WHEN an attempt is made to insert a row into `configuracion_costos` or `calendario_apertura`
  with `vigente_desde` whose operational day is earlier than the current operational day
- THEN the database rejects the `INSERT`, without the application needing to validate it
  beforehand

#### Scenario: A `vigente_desde` on the current or a future operational day is accepted
- GIVEN the same migrated database
- WHEN an attempt is made to insert a row with `vigente_desde` whose operational day is equal to
  or later than the current operational day
- THEN the database accepts the `INSERT`

#### Scenario: The comparison uses the operational day, not the server's calendar date
- GIVEN a `vigente_desde` loaded in the early morning, whose operational day, under the 05:00
  rule, still belongs to the previous operational day even though its raw calendar date already
  matches today's
- WHEN the rejection is evaluated
- THEN the rejection is decided using `dia_operativo(vigente_desde)` compared against
  `dia_operativo(now())`, not the raw calendar date of either

#### Scenario: Item #1's case remains valid — zero inserted rows breaks nothing
- GIVEN a freshly migrated database, with no rows in `configuracion_costos` or
  `calendario_apertura`
- WHEN this item is applied
- THEN the constraint exists with no need for any prior data migration, because there is no
  existing row that could violate it

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
