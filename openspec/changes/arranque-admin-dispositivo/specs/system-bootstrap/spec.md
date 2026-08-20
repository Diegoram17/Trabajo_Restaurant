# System Bootstrap Specification

## Purpose

Turns a freshly migrated, empty database into an operable one: exactly one seeded `administrador`,
a one-time password, no other credentials, and the first row of every configuration table with
authorship resolvable to that admin. Owns the idempotent seed step (`scripts/seed.ts`); does not
own `/admin` login or device enrollment, which consume this bootstrap.

## Requirements

### Requirement: Idempotent Bootstrap Seed

`npm run db:seed` MUST run `seedArranque(db)` inside one transaction. Running it again against an
already-seeded database MUST be a no-op that neither creates a second `administrador` nor reprints
a password, unless invoked with `--regenerar-contrasena`.

#### Scenario: Clean database seed
- GIVEN an empty, migrated PostgreSQL database
- WHEN `npm run db:seed` runs
- THEN it commits one transaction creating the admin and configuration rows, and exits successfully

#### Scenario: Re-running seed is a no-op
- GIVEN a database already seeded
- WHEN `npm run db:seed` runs again with no flag
- THEN it makes no schema or data change and prints no password

#### Scenario: Explicit password regeneration
- GIVEN a database already seeded
- WHEN `npm run db:seed -- --regenerar-contrasena` runs
- THEN it sets a new `contrasena_hash`, re-arms `debe_rotar_contrasena = true`, and prints the new
  plaintext once

### Requirement: One-Time Password Disclosure

The seed MUST create exactly one `persona` row with `rol = administrador`, a generated password
hashed into `contrasena_hash`, and `debe_rotar_contrasena = true`. The plaintext password MUST be
printed to stdout exactly once and MUST NOT be persisted or logged anywhere else.

#### Scenario: Password printed once
- GIVEN a fresh seed run
- WHEN the seed completes
- THEN stdout contains the plaintext password exactly once and no log or table stores it in clear
  text

### Requirement: No Extraneous Credentials Seeded

The seed MUST NOT create any `CredencialCocina` row and MUST NOT create any `dispositivo` row.

#### Scenario: Zero kitchen credentials and zero devices after seed
- GIVEN a freshly seeded database
- WHEN `CredencialCocina` and `dispositivo` are queried
- THEN both return zero rows

### Requirement: Configuration Rows Authored by the Seeded Admin

The seed MUST insert exactly one row into `configuracion_costos`, one into `calendario_apertura`,
and the single row of `configuracion_operativa`. `creada_por` on the first two MUST resolve to the
seeded admin's `persona.id`, and `vigente_desde` MUST be `now()`.

#### Scenario: Seeded rows resolve authorship
- GIVEN a freshly seeded database
- WHEN `configuracion_costos.creada_por` and `calendario_apertura.creada_por` are resolved
- THEN both reference the seeded administrator's `persona.id`

### Requirement: Bootstrap Chain Walkable End to End

From an empty database, the full chain — migrate, seed, `/admin` login, mandatory rotation, enroll
the five screens, define `CredencialCocina` — MUST be completable with no manual intervention
outside the system.

#### Scenario: Full chain from an empty database
- GIVEN an empty database
- WHEN `npm run migrate && npm run db:seed` runs, followed by login, rotation, five enrollments,
  and defining a kitchen credential, all through the system's own screens and endpoints
- THEN every step succeeds and the salon can take and prepare an order afterward
