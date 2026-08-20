# Access Throttling Specification

## Purpose

A persisted, three-anchor lockout ladder (`cuenta`, `ip`, `dispositivo`) keyed in `bloqueo_acceso`,
plus trusted client-IP resolution. Item #3 wires the `cuenta` and `ip` anchors for `/admin`; the
`dispositivo` anchor value ships unused, reserved for #5/#11.

## Requirements

### Requirement: Persisted Escalating Lockout Ladder

`bloqueo_acceso` MUST persist attempt state keyed by `(ancla, valor_ancla)`. Five consecutive
failures on one key MUST lock it for 60 seconds; each further failure while locked MUST double the
wait, capped at 15 minutes; one success MUST reset the counter for that key. This state MUST
survive a process restart.

#### Scenario: `cuenta` anchor escalates and caps
- GIVEN five consecutive failed `/admin` logins for the same `usuario`
- WHEN a sixth attempt arrives inside 60 seconds
- THEN it is rejected as locked, and repeated failures double the wait up to a 15-minute cap

#### Scenario: `ip` anchor escalates independently of `cuenta`
- GIVEN five consecutive failed `/admin` logins from the same client IP but different `usuario`
  values
- WHEN a sixth attempt arrives from that IP
- THEN it is rejected as locked under the `ip` anchor, following the same ladder

#### Scenario: Success resets the counter
- GIVEN a `cuenta` key with prior failures below the lock threshold
- WHEN a login with that `usuario` succeeds
- THEN the failure counter for that key resets to zero

#### Scenario: Lockout state survives a process restart
- GIVEN a `cuenta` key currently locked
- WHEN the server process restarts and the same key is retried before the lock window elapses
- THEN it is still rejected as locked

### Requirement: Trusted Client IP Resolution

The client IP MUST be resolved by taking the hop at position `TRUSTED_PROXY_HOPS` (default `1`)
counted from the right of `X-Forwarded-For`; when the header is absent, it MUST fall back to
`req.socket.remoteAddress`. `::ffff:`-mapped IPv4 addresses MUST be normalized. An unresolvable
address MUST fail closed into one constant shared bucket rather than skip the anchor.

#### Scenario: Resolves the configured rightmost hop
- GIVEN `TRUSTED_PROXY_HOPS = 1` and an `X-Forwarded-For` header with multiple hops
- WHEN the client IP is resolved
- THEN it equals the hop one position from the right

#### Scenario: Falls back to the socket address
- GIVEN no `X-Forwarded-For` header on the request
- WHEN the client IP is resolved
- THEN it equals `req.socket.remoteAddress`

#### Scenario: Unresolvable IP fails closed to a shared bucket
- GIVEN a request whose IP cannot be determined by either path
- WHEN the `ip` anchor is evaluated
- THEN the attempt is counted against one constant shared bucket key, never left uncounted

### Requirement: Anchors Verified Independently

Each anchor MUST be checked and incremented independently of the others. A lock on one anchor's key
MUST NOT reject a request whose other anchor keys are not locked.

#### Scenario: A locked `ip` does not block an unlocked `cuenta` from a different IP
- GIVEN the `ip` anchor locked for IP `A` and the `cuenta` anchor for `usuario` `X` not locked
- WHEN `usuario` `X` logs in successfully from an unrelated IP `B`
- THEN the login succeeds
