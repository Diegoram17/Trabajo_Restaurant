import { describe, expect, it } from 'vitest';
import { hashearCredencial, verificarCredencial } from '../../src/server/auth/kdf';

// ADR-0036 low-entropy branch (design D3-E): the admin password (this item),
// the mesero PIN (#5) and the cocina PIN (#11) are secrets an attacker can
// guess, so they go through Argon2id with PINNED parameters — m=19456 KiB,
// t=2, p=1 — never library defaults. Pinning matters twice: the login decoy
// hash must cost exactly what a real hash costs (timing), and the PHC string
// embeds the parameters so old hashes keep verifying after a change.

describe('hashearCredencial / verificarCredencial', () => {
  it('round-trips: a hashed secret verifies against its own PHC string', async () => {
    const phc = await hashearCredencial('caballo-bateria-palangana-77');
    await expect(verificarCredencial('caballo-bateria-palangana-77', phc)).resolves.toBe(true);
  });

  it('rejects a wrong secret', async () => {
    const phc = await hashearCredencial('caballo-bateria-palangana-77');
    await expect(verificarCredencial('caballo-bateria-palangana-78', phc)).resolves.toBe(false);
  });

  it('embeds the pinned parameters m=19456,t=2,p=1 in the PHC string (D3-E)', async () => {
    const phc = await hashearCredencial('caballo-bateria-palangana-77');
    expect(phc).toContain('m=19456,t=2,p=1');
  });

  it('uses the Argon2id variant', async () => {
    const phc = await hashearCredencial('caballo-bateria-palangana-77');
    expect(phc.startsWith('$argon2id$')).toBe(true);
  });

  it('salts per call: two hashes of the same secret differ', async () => {
    const phc1 = await hashearCredencial('caballo-bateria-palangana-77');
    const phc2 = await hashearCredencial('caballo-bateria-palangana-77');
    expect(phc1).not.toBe(phc2);
  });

  it('a short secret still hashes and verifies (the KDF does not impose the policy)', async () => {
    // Policy (< 12 chars rejected) is contrasena.ts's job (Phase 4); the KDF
    // hashes whatever it is given, including the seeded one-time password.
    const phc = await hashearCredencial('short');
    await expect(verificarCredencial('short', phc)).resolves.toBe(true);
  });
});
