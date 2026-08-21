import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { type Kysely, type Transaction, sql } from 'kysely';
import { createPool } from '../../src/server/db/pool';
import { createDb } from '../../src/server/db/kysely';
import { loadDotEnv } from '../../src/server/config/env';
import { generarToken, hashearToken } from '../../src/server/auth/token';
import { verificarDispositivo } from '../../src/server/auth/dispositivo';
import type { DB } from '../../src/server/db/schema';

// Spec: device-credential ("Verify-and-Renew", "Verification Performance"),
// design "Sequence -- verify and renew". This batch (BACKLOG #3 PR 2) tests
// ONLY verificarDispositivo: fixtures are inserted via direct SQL, since
// enrolarDispositivo does not exist until Phase 5. Real PostgreSQL only
// (ADR-0038): the ahora?/instanteSql pattern here mirrors
// src/server/domain/vigencias.ts (D3-B, every temporal comparison in SQL).
describe('verificarDispositivo (spec: device-credential)', () => {
  let pool: Pool;
  let db: Kysely<DB>;

  beforeAll(() => {
    loadDotEnv();
    pool = createPool(process.env.TEST_DATABASE_URL);
    db = createDb(pool);
  });

  afterAll(async () => {
    await db.destroy();
  });

  class CuerpoCompleto extends Error {}

  async function aislado(cuerpo: (trx: Transaction<DB>) => Promise<void>): Promise<void> {
    try {
      await db.transaction().execute(async (trx) => {
        await cuerpo(trx);
        throw new CuerpoCompleto();
      });
    } catch (error) {
      if (!(error instanceof CuerpoCompleto)) {
        throw error;
      }
    }
  }

  /** Inserts a `dispositivo` fixture and returns its id plus the plaintext
   *  credential cookie value ("{id}.{tokenHex}"). */
  async function insertarDispositivo(
    trx: Transaction<DB>,
    opciones: { readonly expiraEn: Date; readonly revocadoEn?: Date },
  ): Promise<{ readonly id: number; readonly cookie: string }> {
    const token = generarToken();
    const sal = generarToken().subarray(0, 16);
    const hash = hashearToken(token, sal);
    const fila = await trx
      .insertInto('dispositivo')
      .values({
        nombre: 'Estación 1',
        rol: 'estacion',
        token_hash: hash,
        token_sal: sal,
        expira_en: opciones.expiraEn,
        revocado_en: opciones.revocadoEn ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: fila.id, cookie: `${fila.id}.${token.toString('hex')}` };
  }

  it("returns 'ausente' when no cookie is present", async () => {
    await aislado(async (trx) => {
      const resultado = await verificarDispositivo(trx, undefined);
      expect(resultado).toEqual({ estado: 'ausente' });
    });
  });

  it("returns 'ausente' for a malformed cookie (no separator, bad hex)", async () => {
    await aislado(async (trx) => {
      expect(await verificarDispositivo(trx, 'no-separator')).toEqual({ estado: 'ausente' });
      expect(await verificarDispositivo(trx, '1.not-hex')).toEqual({ estado: 'ausente' });
    });
  });

  it("returns 'invalido' when the id does not resolve to any row", async () => {
    await aislado(async (trx) => {
      const cookie = `999999.${generarToken().toString('hex')}`;
      expect(await verificarDispositivo(trx, cookie)).toEqual({ estado: 'invalido' });
    });
  });

  it("returns 'revocado' for a revoked device, even with the correct token", async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { cookie } = await insertarDispositivo(trx, {
        expiraEn: new Date('2026-04-01T12:00:00Z'),
        revocadoEn: new Date('2025-12-01T12:00:00Z'),
      });
      expect(await verificarDispositivo(trx, cookie, ahora)).toEqual({ estado: 'revocado' });
    });
  });

  it("returns 'vencido' for an expired, non-revoked device", async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { cookie } = await insertarDispositivo(trx, { expiraEn: new Date('2025-12-01T12:00:00Z') });
      expect(await verificarDispositivo(trx, cookie, ahora)).toEqual({ estado: 'vencido' });
    });
  });

  it("returns 'invalido' for a wrong (e.g. rotated-away) token against a real, live row", async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { id } = await insertarDispositivo(trx, { expiraEn: new Date('2026-06-01T12:00:00Z') });
      const cookieAjeno = `${id}.${generarToken().toString('hex')}`;
      expect(await verificarDispositivo(trx, cookieAjeno, ahora)).toEqual({ estado: 'invalido' });
    });
  });

  it('renews expira_en to +90 days when remaining life is under 89 days', async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { id, cookie } = await insertarDispositivo(trx, {
        // 5 days remaining -- well inside the 89-day renewal threshold.
        expiraEn: new Date('2026-01-06T12:00:00Z'),
      });
      const resultado = await verificarDispositivo(trx, cookie, ahora);
      expect(resultado.estado).toBe('valido');
      if (resultado.estado !== 'valido') throw new Error('unreachable');
      expect(resultado.renovada).toBe(true);
      expect(resultado.dispositivo.id).toBe(id);
      const esperado = new Date('2026-04-01T12:00:00Z'); // ahora + 90 days
      expect(new Date(resultado.dispositivo.expira_en).getTime()).toBe(esperado.getTime());
    });
  });

  it('makes no write when remaining life is 89 days or more', async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const expiraOriginal = new Date('2026-04-15T12:00:00Z'); // ~104 days out
      const { cookie } = await insertarDispositivo(trx, { expiraEn: expiraOriginal });
      const resultado = await verificarDispositivo(trx, cookie, ahora);
      expect(resultado.estado).toBe('valido');
      if (resultado.estado !== 'valido') throw new Error('unreachable');
      expect(resultado.renovada).toBe(false);
      expect(new Date(resultado.dispositivo.expira_en).getTime()).toBe(expiraOriginal.getTime());
    });
  });

  it('writes at most once per device per calendar day: a second call at the same instant renews nothing further', async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { cookie } = await insertarDispositivo(trx, { expiraEn: new Date('2026-01-06T12:00:00Z') });

      const primera = await verificarDispositivo(trx, cookie, ahora);
      expect(primera.estado).toBe('valido');
      if (primera.estado !== 'valido') throw new Error('unreachable');
      expect(primera.renovada).toBe(true);

      const segunda = await verificarDispositivo(trx, cookie, ahora);
      expect(segunda.estado).toBe('valido');
      if (segunda.estado !== 'valido') throw new Error('unreachable');
      expect(segunda.renovada).toBe(false);
      expect(new Date(segunda.dispositivo.expira_en).getTime()).toBe(
        new Date(primera.dispositivo.expira_en).getTime(),
      );
    });
  });

  it('verification cost stays well under the 50ms Argon2id floor', async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { cookie } = await insertarDispositivo(trx, { expiraEn: new Date('2026-06-01T12:00:00Z') });
      const inicio = performance.now();
      await verificarDispositivo(trx, cookie, ahora);
      const duracionMs = performance.now() - inicio;
      expect(duracionMs).toBeLessThan(50);
    });
  });

  // Structural control: proves the `revocado_en IS NULL` fixture path is a
  // real, queryable row before trusting the 'revocado' assertions above.
  it('sanity: a fresh non-revoked, non-expired fixture verifies as valido', async () => {
    await aislado(async (trx) => {
      const ahora = new Date('2026-01-01T12:00:00Z');
      const { cookie } = await insertarDispositivo(trx, { expiraEn: new Date('2026-06-01T12:00:00Z') });
      const filaCruda = await trx
        .selectFrom('dispositivo')
        .select(sql<number>`count(*)`.as('total'))
        .executeTakeFirstOrThrow();
      expect(Number(filaCruda.total)).toBeGreaterThan(0);
      expect((await verificarDispositivo(trx, cookie, ahora)).estado).toBe('valido');
    });
  });
});
