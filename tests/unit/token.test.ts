import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generarToken, hashearToken, tokenCoincide } from '../../src/server/auth/token';

// ADR-0036 high-entropy branch: device tokens and session tokens are
// >= 128-bit CSPRNG values, so they are NOT run through a KDF. Storage is
// SHA-256 with a per-credential salt (explicitly not a KDF), and the
// comparison is timing-safe. These tests freeze all three properties.

describe('generarToken', () => {
  it('returns a 32-byte value (>= 128 bits of CSPRNG entropy)', () => {
    const token = generarToken();
    expect(token).toHaveLength(32);
  });

  it('two calls are unrelated (no deducible relation between enrolments)', () => {
    const a = generarToken();
    const b = generarToken();
    expect(a.equals(b)).toBe(false);
  });
});

describe('hashearToken', () => {
  it('is exactly sha256(sal || token) — salt first, then token', () => {
    const token = generarToken();
    const sal = generarToken().subarray(0, 16);
    const esperado = createHash('sha256').update(Buffer.concat([sal, token])).digest();
    expect(hashearToken(token, sal).equals(esperado)).toBe(true);
  });

  it('different salts produce different hashes for the same token', () => {
    const token = generarToken();
    const sal1 = generarToken().subarray(0, 16);
    const sal2 = generarToken().subarray(0, 16);
    expect(hashearToken(token, sal1).equals(hashearToken(token, sal2))).toBe(false);
  });
});

describe('tokenCoincide', () => {
  it('accepts the matching (token, sal, hash) triple', () => {
    const token = generarToken();
    const sal = generarToken().subarray(0, 16);
    const hash = hashearToken(token, sal);
    expect(tokenCoincide(token, sal, hash)).toBe(true);
  });

  it('a one-bit change in the token is rejected', () => {
    const token = generarToken();
    const sal = generarToken().subarray(0, 16);
    const hash = hashearToken(token, sal);
    const tokenAlterado = Buffer.from(token);
    tokenAlterado[0] = tokenAlterado[0]! ^ 0b0000_0001;
    expect(tokenCoincide(tokenAlterado, sal, hash)).toBe(false);
  });

  it('a one-bit change in the stored hash is rejected', () => {
    const token = generarToken();
    const sal = generarToken().subarray(0, 16);
    const hash = Buffer.from(hashearToken(token, sal));
    hash[31] = hash[31]! ^ 0b1000_0000;
    expect(tokenCoincide(token, sal, hash)).toBe(false);
  });
});

// Timing safety is a property of HOW buffers are compared, not of any
// observable output, so the last check is structural (same approach as
// sin-sql-interpolado.test.ts): the module must compare through
// crypto.timingSafeEqual, never through === on the hash bytes.
describe('tokenCoincide compares through timingSafeEqual (structural freeze)', () => {
  const fuente = readFileSync(
    fileURLToPath(new URL('../../src/server/auth/token.ts', import.meta.url)),
    'utf8',
  );

  it('the source calls crypto.timingSafeEqual', () => {
    expect(fuente).toContain('timingSafeEqual');
  });

  it('the source never compares hash bytes with ===', () => {
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(sinComentarios).not.toMatch(/===\s*hash|hash\s*===/);
  });
});
