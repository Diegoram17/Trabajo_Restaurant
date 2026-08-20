# Admin Access Specification

## Purpose

`/admin` login by `usuario`/`contrasena`, a server-side session with 60-minute inactivity expiry,
mandatory first-login password rotation, and the SEC-09 password policy. Unlike mesero/cocina PIN
verification, `/admin` login requires no device cookie (ADR-0034).

## Requirements

### Requirement: Password-Based Login Without Device Precondition

`/admin` login MUST succeed with a valid `usuario`/`contrasena` pair with no `dispositivo` cookie
present. The login procedure MUST NOT read or require the device cookie.

#### Scenario: Successful login with no device cookie
- GIVEN a seeded administrator and a client with no `__Host-dispositivo` cookie
- WHEN the client submits valid `usuario`/`contrasena` to the login procedure
- THEN the login succeeds and a session is issued

### Requirement: Uniform Failure for Unknown User and Wrong Password

A login attempt for a nonexistent `usuario` and an attempt with a wrong `contrasena` for an
existing `usuario` MUST return an indistinguishable response body and MUST complete within
comparable response time, so neither case is distinguishable from the other.

#### Scenario: Same response shape for both failure causes
- GIVEN one login attempt with an unknown `usuario` and one with a wrong `contrasena` for a real
  `usuario`
- WHEN both requests are compared
- THEN both return the same error shape with no field revealing which case occurred

#### Scenario: Comparable response timing for both failure causes
- GIVEN the same two attempts as above, measured over repeated runs
- WHEN their response latencies are compared
- THEN the timing difference stays within a bounded jitter that does not reveal `usuario`
  existence

### Requirement: Server-Side Session With Inactivity Expiry

A successful login MUST create a `sesion_admin` row and respond with
`Set-Cookie: __Host-sesion=...; Secure; HttpOnly; SameSite=Strict`. The session MUST expire after
60 minutes with no authenticated request, and each authenticated request MUST refresh
`ultima_actividad_en`, bounded to at most one write per minute.

#### Scenario: Cookie attributes asserted without TLS
- GIVEN a successful login over plain HTTP in a test environment
- WHEN the literal `Set-Cookie` header is inspected
- THEN it contains `__Host-sesion`, `Secure`, `HttpOnly`, and `SameSite=Strict`

#### Scenario: Session survives activity inside the window
- GIVEN a session created at time T
- WHEN an authenticated request arrives at T + 59 minutes
- THEN the session remains valid and `ultima_actividad_en` advances

#### Scenario: Session expires after 60 minutes of inactivity
- GIVEN a session with no authenticated request since T
- WHEN a request arrives at T + 61 minutes
- THEN the session is rejected as expired

### Requirement: Mandatory First-Login Password Rotation

While `debe_rotar_contrasena` is `true` for the authenticated session's `persona`, every `/admin`
action other than rotating the password MUST be rejected.

#### Scenario: Access blocked pending rotation
- GIVEN a session where `debe_rotar_contrasena = true`
- WHEN the session calls any `/admin` action other than rotate-password
- THEN the server rejects it with a reason identifying pending rotation

#### Scenario: Rotation clears the flag and unblocks access
- GIVEN the same session
- WHEN a compliant new password is submitted to rotate-password
- THEN `debe_rotar_contrasena` becomes `false` and subsequent actions succeed

### Requirement: Password Policy on Rotation (SEC-09)

A new password MUST be rejected, with the reason stated, when it is shorter than 12 characters,
equal to the current (including the seeded) password, or present in a common-password list.

#### Scenario: Reject a password shorter than 12 characters
- GIVEN a pending rotation
- WHEN an 11-character password is submitted
- THEN the rotation is rejected with the minimum-length reason

#### Scenario: Reject the seeded password
- GIVEN a pending rotation
- WHEN the current seeded password is resubmitted
- THEN the rotation is rejected with a same-password reason

#### Scenario: Reject a common password
- GIVEN a pending rotation
- WHEN a password present in the common-password list is submitted
- THEN the rotation is rejected with a common-password reason

#### Scenario: Accept a compliant password
- GIVEN a pending rotation
- WHEN a 12+ character password absent from the common list and different from the current one is
  submitted
- THEN the rotation succeeds and `debe_rotar_contrasena` becomes `false`
