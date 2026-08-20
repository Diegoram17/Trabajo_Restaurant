# Vigencia Resolution Specification

## Purpose

Defines the "currently effective version" query over `configuracion_costos` and
`calendario_apertura`: which row governs the current operational day. This algorithm is not
written in `TECH-DESIGN.md` today; it is only inferred from item #1's design prose about `UNIQUE
(vigente_desde)`.

## Requirements

### Requirement: The effective version is the one with the highest `vigente_desde` whose operational day has already arrived

For `configuracion_costos` and for `calendario_apertura`, independently, the system MUST resolve
the effective version by comparing the **operational day of `vigente_desde`** — not its raw
`timestamptz` value nor its calendar date — against `dia_operativo(now())`, and MUST take the row
whose `vigente_desde` is the highest among those satisfying `dia_operativo(vigente_desde) <=
dia_operativo(now())`. Comparing `vigente_desde` directly against `dia_operativo(now())` without
also passing it through `dia_operativo()` MUST NOT be valid: a row loaded in the early morning
would be compared against the wrong operational day — the same defect ADR-0028 corrects in its
other consumers.

#### Scenario: Several past effective versions exist, and the highest one not exceeding the current day is chosen
- GIVEN three `configuracion_costos` rows with `vigente_desde` on three different operational
  days, all earlier than or equal to the current operational day
- WHEN the effective version is resolved
- THEN the row with the highest `vigente_desde` of the three is obtained

#### Scenario: A future effective version is not chosen even if its calendar date has already started
- GIVEN a row whose operational day, per `dia_operativo(vigente_desde)`, has not yet arrived when
  compared against `dia_operativo(now())`, even though its calendar date matches today's
- WHEN the effective version is resolved
- THEN that row is excluded from the result

#### Scenario: No applicable version exists
- GIVEN a table with zero rows, or with all its rows on a future operational day
- WHEN the effective version is resolved
- THEN the query returns no row, and no default value is substituted

#### Scenario: Two effective versions on the same operational day are disambiguated without ambiguity
- GIVEN two rows whose `vigente_desde` falls on the same operational day but at different
  instants, both eligible
- WHEN the effective version is resolved
- THEN the row with the highest `vigente_desde` is obtained, and the result is deterministic
  because `UNIQUE (vigente_desde)` guarantees that no two rows share the exact same instant
