# App Skeleton Specification

## Purpose

Defines the single-origin runtime the rest of the backlog builds on: one Node process serving the
tRPC API and the built React SPA, the four placeholder routes it exposes, and the transport rules
(no cleartext port, `Origin` validation) that must hold before any domain mutation exists. Covers
only the running shell — zero domain UI, zero business logic.

## Requirements

### Requirement: Single-Origin Serving

The backend process MUST serve the tRPC API and the built SPA static assets from the same origin
(ADR-0037). No separate front-end origin MAY exist.

#### Scenario: SPA and API share one origin
- GIVEN the application is started
- WHEN a client requests a static SPA asset and calls a tRPC procedure
- THEN both responses come from the same scheme, host, and port

#### Scenario: No alternate front-end origin is configured
- GIVEN the running configuration
- WHEN inspected for origin/CORS declarations
- THEN only one origin serves both the SPA and the API — no allowance for a second origin exists

### Requirement: Four Placeholder Routes

The SPA MUST expose exactly `/estacion`, `/kds`, `/cocina`, `/admin` (ADR-0001) as client-side
routes resolved by the SPA entry point. No route beyond these four MAY exist, and no domain UI is
in scope — placeholders only.

#### Scenario: Each route resolves
- GIVEN the running application
- WHEN a client navigates directly to `/estacion`, `/kds`, `/cocina`, or `/admin`
- THEN the SPA entry point loads and renders that route's placeholder, not a 404

#### Scenario: Unknown paths fall back to the SPA
- GIVEN the running application
- WHEN a client requests a path outside the four routes and outside the API namespace
- THEN the server returns the SPA entry point so client-side routing resolves it

### Requirement: End-to-End Typed tRPC

At least one tRPC procedure MUST be wired end-to-end so the SPA calls it through an inferred-type
client, with no manually duplicated request/response types.

#### Scenario: A typed call succeeds
- GIVEN the running application
- WHEN the SPA invokes the wired tRPC procedure
- THEN the call returns a response whose type is inferred from the server-side procedure

### Requirement: Origin Validation on Mutations

Every tRPC mutation MUST validate the request's `Origin` header server-side and reject any value
not matching the system's own origin (ADR-0033 §3, unaffected by ADR-0037). Item #1 defines no
domain mutation, so this MUST be proven against a throwaway procedure created only to exercise the
check.

#### Scenario: Matching origin is accepted
- GIVEN a throwaway tRPC mutation guarded by `Origin` validation
- WHEN it is called with `Origin` equal to the system's own origin
- THEN the call is accepted

#### Scenario: Foreign origin is rejected
- GIVEN the same throwaway mutation
- WHEN it is called with an `Origin` header for a different site
- THEN the server rejects the call before any side effect executes

### Requirement: No Cleartext Transport

The backend process MUST NOT expose a port that accepts unencrypted traffic to any network. An
unencrypted request MUST be rejected outright, never redirected — a redirect would let the first
request travel with a cookie already attached.

#### Scenario: Unencrypted request is rejected, not redirected
- GIVEN the running backend
- WHEN a plain, unencrypted HTTP request reaches the port the backend listens on
- THEN the connection is rejected and no `3xx` redirect response is issued

How this holds during local development, where the hosting platform's edge TLS is absent, is a
design decision (e.g., a dev-only encrypted listener); this spec only fixes the observable behavior.

### Requirement: Verifiable "Running" State

Done means the system **runs on the deployment topology's shape, not that it is deployed**. A fresh
clone MUST install, migrate, and start using only documented commands, without provisioning Render
or Neon, and then serve all four routes and the tRPC API from one origin against PostgreSQL, per the
Base Schema spec's migration requirement.

#### Scenario: Fresh clone reaches a running state
- GIVEN a fresh clone of the repository and a reachable PostgreSQL instance
- WHEN the documented install, migrate, and start commands run in order
- THEN the process starts, serves the four routes, and serves at least one tRPC procedure — with no
  Render or Neon account required

### Requirement: TECH-DESIGN.md Propagation

Every acceptance criterion this spec adds MUST also be written into `TECH-DESIGN.md` as a Spanish
`- [ ]` checkbox before the change is archived; the delta spec alone does not satisfy the project's
propagation obligation.

#### Scenario: Archive carries the criteria forward
- GIVEN this spec's requirements are implemented and verified
- WHEN the change is archived
- THEN `TECH-DESIGN.md` contains a matching `- [ ]` checkbox, in Spanish, for each requirement above
