/**
 * Low-entropy credential primitives (ADR-0036, design D3-E): the admin
 * password (this item), the mesero PIN (#5) and the cocina PIN (#11) are
 * secrets an attacker can enumerate, so they are hashed with Argon2id
 * under PINNED parameters — m=19456 KiB, t=2, p=1 — never library
 * defaults. Two reasons, both load-bearing:
 *
 * - the `/admin` login decoy hash (Phase 3) must cost exactly what a real
 *   hash costs, or the timing difference becomes a username oracle;
 * - the PHC string embeds the parameters, so a later change re-hashes on
 *   the write side while old hashes keep verifying.
 *
 * Both functions are async on the libuv threadpool (napi-rs): a `> 50 ms`
 * verify never blocks the single-process event loop (ADR-0037).
 */

import { hash, verify } from '@node-rs/argon2';

/**
 * Pinned Argon2id parameters (D3-E): m=19456 KiB, t=2 iterations, p=1 lane.
 * The variant itself is the library's default (Argon2id); it is frozen
 * behaviorally by tests/unit/kdf.test.ts asserting the `$argon2id$` PHC
 * prefix, because @node-rs/argon2's `Algorithm` is a const enum that
 * `isolatedModules` cannot reference across modules.
 */
const PARAMETROS_ARGON2ID = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes a low-entropy secret into a self-describing Argon2id PHC string. */
export function hashearCredencial(secreto: string): Promise<string> {
  return hash(secreto, PARAMETROS_ARGON2ID);
}

/**
 * Verifies a secret against its stored PHC string. Returns false on a
 * mismatch; a malformed PHC string is a programming error and throws.
 */
export function verificarCredencial(secreto: string, phc: string): Promise<boolean> {
  return verify(phc, secreto);
}
