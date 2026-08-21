/**
 * High-entropy credential primitives (ADR-0036): device tokens, session
 * tokens and their ids are >= 128-bit CSPRNG values, so they are NOT run
 * through a KDF — that cost exists for low-entropy secrets (see `kdf.ts`).
 * Storage is SHA-256 with a per-credential salt, which makes "find the row
 * by hash" impossible by construction, and the comparison is timing-safe.
 *
 * The module boundary IS the entropy question: a future secret is
 * classified by which of `token.ts`/`kdf.ts` it imports (design D3-D).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 32 bytes of CSPRNG output — the >= 128-bit token/`sesion_admin.id` material. */
export function generarToken(): Buffer {
  return randomBytes(32);
}

/** sha256(sal || token) — the only storage form of a high-entropy credential. */
export function hashearToken(token: Buffer, sal: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([sal, token])).digest();
}

/**
 * Timing-safe comparison of a presented token against its stored salted
 * hash. Both sides are 32 bytes by construction (SHA-256), so
 * `timingSafeEqual`'s equal-length precondition always holds.
 */
export function tokenCoincide(token: Buffer, sal: Buffer, hash: Buffer): boolean {
  return timingSafeEqual(hashearToken(token, sal), hash);
}
