# Data Access Specification

## Purpose

Defines the acceptance properties the data access layer MUST satisfy for money, identifiers, and
row locking. Choosing which tool implements them (ADR-0042) is sdd-apply's work, not this
specification's.

## Requirements

### Requirement: Every amount and percentage is written via a bound parameter

The system MUST write every money or percentage value through a bound driver parameter, never as
a SQL literal interpolated into the query text. The `integer` column type MUST NOT be considered
sufficient protection: a fractional literal against that column is silently rounded with a rule
different from ADR-0032's, instead of being rejected.

#### Scenario: Writing an amount uses a bound parameter
- GIVEN an integer money value to persist in an `integer` cents column
- WHEN the data access code executes the `INSERT` or `UPDATE`
- THEN the value travels as a bound driver parameter, not as text concatenated into the SQL
  statement

#### Scenario: No money-writing path bypasses the bound parameter
- GIVEN the complete write surface of money and percentage columns
- WHEN each write point is audited
- THEN none of them build the statement with the value interpolated directly into the SQL text

### Requirement: Spanish identifiers pass through without mapping

The system MUST propagate table, column, and enumeration value names in Spanish and in
snake_case, identical across database, backend, and client (ADR-0040), with no camelCase
translation layer or any other intermediate renaming.

#### Scenario: A Spanish column name reaches the generated type unchanged
- GIVEN a `vigente_desde` column in the database
- WHEN the corresponding type is generated or inferred for the data access layer
- THEN the field is named `vigente_desde` in that type, with no translation or renaming

### Requirement: Row locking is reachable with no escape hatch

The system MUST expose row locking (`SELECT ... FOR UPDATE`) as a first-class operation of the
data access layer, reachable for any query that needs it without falling back to raw SQL outside
that layer as the only path.

#### Scenario: A query can request row locking through the data access layer's API
- GIVEN a query that needs to read and lock a row inside a transaction
- WHEN that query is built with the data access layer
- THEN the row lock is expressed through that layer's API, with no need for a separate raw SQL
  query outside it
