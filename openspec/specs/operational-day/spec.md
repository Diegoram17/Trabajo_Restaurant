# Operational Day Specification

## Purpose

Defines `dia_operativo()`, the system's single "day" function (ADR-0028): it starts at 05:00 Lima
time and partitions time with no gaps or overlaps. A standalone `DATE(timestamp)` MUST NOT be
treated as a valid implementation in its place.

## Requirements

### Requirement: `dia_operativo(timestamptz) RETURNS date` pivoting on 05:00 Lima

The system MUST expose a function `dia_operativo(instante timestamptz) RETURNS date`, computed as
`DATE((instante AT TIME ZONE 'America/Lima') - INTERVAL '5 hours')`. This formula MUST live in a
single place in the database, and no other point in the schema or backend MUST recompute it any
other way.

#### Scenario: Saturday 23:40 falls within Saturday's operational day
- GIVEN an instant on Saturday at 23:40 Lima time
- WHEN `dia_operativo(instante)` is evaluated
- THEN the result is Saturday's date

#### Scenario: Sunday 00:30 still falls within Saturday's operational day
- GIVEN an instant on Sunday at 00:30 Lima time
- WHEN `dia_operativo(instante)` is evaluated
- THEN the result is Saturday's date, not Sunday's

#### Scenario: Sunday 05:01 already falls within Sunday's operational day
- GIVEN an instant on Sunday at 05:01 Lima time
- WHEN `dia_operativo(instante)` is evaluated
- THEN the result is Sunday's date

#### Scenario: The exact 05:00 cutoff belongs to the day that is starting
- GIVEN an instant on Sunday at exactly 05:00:00 Lima time
- WHEN `dia_operativo(instante)` is evaluated
- THEN the result is Sunday's date, consistent with the formula: at 05:00, subtracting 5 hours
  yields 00:00 on Sunday

### Requirement: Time is partitioned with no gaps or overlaps

`dia_operativo()` MUST map every instant to exactly one operational day. No instant MUST be left
without an assigned day, and no instant MUST belong to two operational days at once.

#### Scenario: The instant right before and right after the cutoff fall on consecutive days, with no overlap
- GIVEN two instants on the same Sunday, Lima time: one at 04:59:59 and one at 05:00:00
- WHEN `dia_operativo()` is evaluated on each
- THEN the first falls within Saturday's operational day and the second within Sunday's, with no
  overlap

### Requirement: `dia_operativo()` is a constant, not a configurable value

The 05:00 pivot MUST be fixed inside the function and MUST NOT depend on any configuration row or
any versioned parameter.

#### Scenario: The result does not change based on any configuration table
- GIVEN any state of `configuracion_costos`, `calendario_apertura`, or `configuracion_operativa`
- WHEN `dia_operativo(instante)` is evaluated for the same instant
- THEN the result is always the same, without reading any of those tables
