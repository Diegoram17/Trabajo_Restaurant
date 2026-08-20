# Money Rounding Specification

## Purpose

Defines the system's single monetary rounding point (ADR-0032, ADR-0039) and its two usage
families: allocation (there is a total to respect) and percentage (there is none). Both must be
composable by future consumers (combo pricing, fixed-cost allocation, batch closing, IGV,
commission, waste) without editing the primitive.

## Requirements

### Requirement: Single cent-rounding function

The system MUST expose a single monetary rounding function, applied to the nearest cent using a
half-up rule. No money calculation MUST use a different rule or a second rounding point.

#### Scenario: A value exactly at the half-cent mark rounds up
- GIVEN a fractional value whose fractional-cent part is exactly 0.5
- WHEN the rounding function is applied
- THEN the result is the next whole cent above

#### Scenario: Applying a percentage does not introduce a second rounding
- GIVEN an integer amount in cents and an integer percentage in basis points
- WHEN the resulting amount is computed (multiply by basis points, divide by 10,000)
- THEN the division happens inside the single rounding function, at its single application point,
  with no intermediate rounding before that point

### Requirement: Allocation respects the total, by construction

When there is an integer total to respect, the system MUST truncate each part, compute the
remainder as the difference between the total and the sum of the truncated parts, and assign that
remainder one cent per part, in a deterministic order **provided by the caller** (an injectable
comparator or ordering, never a fixed order inside the primitive), until it is exhausted. The sum
of the resulting parts MUST be exactly equal to the total.

#### Scenario: The sum of the allocated parts equals the exact total
- GIVEN an integer total and a list of proportional weights, with a remainder-assignment order
  provided by the caller
- WHEN the allocation runs
- THEN the sum of the resulting parts is exactly equal to the total, with no difference

#### Scenario: The remainder is assigned in whatever order each caller specifies, not a fixed order
- GIVEN two consumers that allocate the same total with different assignment orders
- WHEN each runs the allocation with its own order
- THEN each receives the extra cent on the parts its own order determines, without modifying the
  allocation primitive

#### Scenario: A zero remainder leaves every part unchanged
- GIVEN a total that divides exactly among the truncated parts, with no remainder
- WHEN the allocation runs
- THEN no part receives an extra cent, and the sum still equals the total

### Requirement: Percentage does not repeat rounding over an aggregate

When there is no total to respect, the system MUST apply half-up rounding at the finest-grained
row where the amount is persisted, and every higher level MUST be a sum of those already-rounded
integers. No report or aggregate MUST round again over an already-summed total.

#### Scenario: The aggregate is the sum of the fine-grained rows, not a new rounding
- GIVEN several fine-grained rows with a percentage already applied and rounded on each
- WHEN a higher-level total is computed over those rows
- THEN the total is the arithmetic sum of the already-rounded integers, not a percentage
  recalculated over the aggregate
