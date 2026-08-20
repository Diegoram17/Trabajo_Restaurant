# Device Credential Specification

## Purpose

The `dispositivo` entity and its full token lifecycle: enroll (token shown once), rotate without
re-enrolling, revoke, and verify-and-renew. Feeds the SSE stream precondition item #4 consumes.

## Requirements

### Requirement: Token Issuance on Enrollment

Enrolling a device MUST generate a token of at least 128 bits from a CSPRNG, return it in the
enrollment response exactly once, and persist only `SHA-256(token + salt)`. Two consecutive
enrollments MUST produce tokens with no deducible relation to each other.

#### Scenario: Two enrollments produce unrelated tokens
- GIVEN two separate enrollment calls
- WHEN the two issued tokens are compared
- THEN no deducible relation exists between them

#### Scenario: Token is not retrievable after issuance
- GIVEN a device already enrolled
- WHEN any subsequent query for that device is made
- THEN the plaintext token is not present in the response; only the hash is stored

### Requirement: Rotate Without Re-Enrolling

`/admin` MUST offer rotating a device's token without changing its identity, visually distinguished
from revocation. The previous token MUST be rejected immediately once rotation completes.

#### Scenario: Rotated device receives a new token, old one rejected
- GIVEN an enrolled device with an active token
- WHEN `/admin` rotates that device's token
- THEN a new token is issued once and the previous token is rejected on the next verification

### Requirement: Revocation

Revoking a device MUST cause every subsequent verification with that device's token to be
rejected as `revocado`, and MUST NOT affect any other device's verification.

#### Scenario: Revoked device rejected, others unaffected
- GIVEN two enrolled devices, A and B
- WHEN device A is revoked from `/admin`
- THEN verification with A's token is rejected as `revocado` and verification with B's token
  still succeeds

### Requirement: Verify-and-Renew

`verificarDispositivo(db, cookie, ahora)` MUST classify a request into `ausente`, `invalido`,
`vencido`, or `revocado`, or else return the resolved device. On a successful verification, it
MUST renew `expira_en` to `ahora + 90 days` only when the device's remaining life is under 89 days,
writing at most once per device per calendar day.

#### Scenario: Successful verification renews expiry near the boundary
- GIVEN a device whose `expira_en` is 5 days away from `ahora`
- WHEN `verificarDispositivo` succeeds
- THEN `expira_en` is renewed to `ahora + 90 days`

#### Scenario: Verification well inside the window makes no write
- GIVEN a device whose `expira_en` is 89 days or more away from `ahora`
- WHEN `verificarDispositivo` succeeds
- THEN `expira_en` is not modified

#### Scenario: Expired token rejected
- GIVEN a device whose `expira_en` is before `ahora` and not revoked
- WHEN `verificarDispositivo` runs
- THEN it classifies the result as `vencido`

#### Scenario: Rotated-away token rejected
- GIVEN a device whose token was rotated, and the cookie carries the previous token
- WHEN `verificarDispositivo` runs
- THEN it classifies the result as `invalido`

### Requirement: Verification Performance

Verifying a device token MUST cost well under the >50ms Argon2id floor used for low-entropy
credentials, since it is a SHA-256 comparison invoked on every stream request.

#### Scenario: Verification latency stays under the floor
- GIVEN a valid device token
- WHEN `verificarDispositivo` measures its own hashing/comparison cost
- THEN the cost stays well under 50ms
