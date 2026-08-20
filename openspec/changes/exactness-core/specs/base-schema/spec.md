# Delta for Base Schema

## RENAMED Requirements

### Requirement: `vigente_desde` Ships Without a Temporal Constraint → `vigente_desde` Rejects a Past Operational Day at the Database Level

(Reason: item #1 deliberately shipped `vigente_desde` with no temporal `CHECK`, on the record that no
row and no write path existed yet to exercise the missing rule. This item is exactly the one that adds
that write path and closes the deferral, so the old title — which asserted the constraint's absence — is
now factually false.)
(Migration: None — no downstream artifact references the old requirement name; the full replacement text
is below under MODIFIED Requirements.)

## MODIFIED Requirements

### Requirement: `vigente_desde` Rejects a Past Operational Day at the Database Level

`vigente_desde` in `configuracion_costos` and `calendario_apertura` MUST be `timestamptz NOT NULL`
and MUST be rejected by the database — not only by the application — when its operational day,
`dia_operativo(vigente_desde)`, is earlier than the current operational day,
`dia_operativo(now())` (ADR-0022, refined by ADR-0028). The comparison MUST use `dia_operativo()`
on both sides; it MUST NOT compare `vigente_desde`'s raw calendar date nor the server's calendar
date.

(Previously: `vigente_desde` carried no `CHECK` and no trigger — rejection was deferred to this
item because item #1 inserted no row and there was no write path to exercise it.)

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
