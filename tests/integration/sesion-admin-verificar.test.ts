import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { type Kysely, type Transaction } from 'kysely';
import { createPool } from '../../src/server/db/pool';
import { createDb } from '../../src/server/db/kysely';
import { loadDotEnv } from '../../src/server/config/env';
import { generarToken } from '../../src/server/auth/token';
import { crearSesionAdmin, revocarSesionesDePersona, verificarSesionAdmin } from '../../src/server/auth/sesion-admin';
import type { DB } from '../../src/server/db/schema';

// Spec: admin-access ("Server-Side Session With Inactivity Expiry"), design
// "Interfaces" (D3-C: ResultadoSesion mirrors ResultadoDispositivo's shape,
// same "{id}.{token}" construction) and D3-H (ultima_actividad_en throttled
// to <=1 write/minute). Real PostgreSQL only (ADR-0038).
describe('sesion-admin (spec: admin-access)', () => {
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

  let contadorUsuario = 0;

  async function crearPersonaAdmin(trx: Transaction<DB>): Promise<number> {
    contadorUsuario += 1;
    const fila = await trx
      .insertInto('persona')
      .values({
        nombre: 'Prueba Admin',
        rol: 'administrador',
        usuario: `prueba-sesion-${contadorUsuario}`,
        contrasena_hash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
        debe_rotar_contrasena: false,
        activo: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return fila.id;
  }

  it('creates a session and verifies it back with the matching credential', async () => {
    await aislado(async (trx) => {
      const personaId = await crearPersonaAdmin(trx);
      const creada = await crearSesionAdmin(trx, personaId);
      const cookie = `${creada.id}.${creada.token.toString('hex')}`;

      const resultado = await verificarSesionAdmin(trx, cookie);
      expect(resultado.estado).toBe('valido');
      if (resultado.estado !== 'valido') throw new Error('unreachable');
      expect(resultado.sesion.persona_id).toBe(personaId);
    });
  });

  it("returns 'ausente' when no cookie is present", async () => {
    await aislado(async (trx) => {
      expect(await verificarSesionAdmin(trx, undefined)).toEqual({ estado: 'ausente' });
    });
  });

  it("returns 'ausente' for a malformed cookie", async () => {
    await aislado(async (trx) => {
      expect(await verificarSesionAdmin(trx, 'sin-separador')).toEqual({ estado: 'ausente' });
      expect(await verificarSesionAdmin(trx, 'abc.not-hex')).toEqual({ estado: 'ausente' });
    });
  });

  it("returns 'invalido' when the session id does not resolve to any row", async () => {
    await aislado(async (trx) => {
      const cookie = `${generarToken().toString('hex')}.${generarToken().toString('hex')}`;
      expect(await verificarSesionAdmin(trx, cookie)).toEqual({ estado: 'invalido' });
    });
  });

  it("returns 'invalido' for a real session id with the wrong token", async () => {
    await aislado(async (trx) => {
      const personaId = await crearPersonaAdmin(trx);
      const creada = await crearSesionAdmin(trx, personaId);
      const cookieAjeno = `${creada.id}.${generarToken().toString('hex')}`;
      expect(await verificarSesionAdmin(trx, cookieAjeno)).toEqual({ estado: 'invalido' });
    });
  });

  it("returns 'revocada' for a session revoked via revocarSesionesDePersona", async () => {
    await aislado(async (trx) => {
      const personaId = await crearPersonaAdmin(trx);
      const creada = await crearSesionAdmin(trx, personaId);
      const cookie = `${creada.id}.${creada.token.toString('hex')}`;

      await revocarSesionesDePersona(trx, personaId);

      expect(await verificarSesionAdmin(trx, cookie)).toEqual({ estado: 'revocada' });
    });
  });

  it('revocarSesionesDePersona does not affect an unrelated persona', async () => {
    await aislado(async (trx) => {
      const personaA = await crearPersonaAdmin(trx);
      const personaB = await crearPersonaAdmin(trx);
      const creadaA = await crearSesionAdmin(trx, personaA);
      const creadaB = await crearSesionAdmin(trx, personaB);

      await revocarSesionesDePersona(trx, personaA);

      const cookieA = `${creadaA.id}.${creadaA.token.toString('hex')}`;
      const cookieB = `${creadaB.id}.${creadaB.token.toString('hex')}`;
      expect(await verificarSesionAdmin(trx, cookieA)).toEqual({ estado: 'revocada' });
      expect((await verificarSesionAdmin(trx, cookieB)).estado).toBe('valido');
    });
  });

  it('remains valid and advances ultima_actividad_en at T+59 minutes', async () => {
    await aislado(async (trx) => {
      const personaId = await crearPersonaAdmin(trx);
      const creada = await crearSesionAdmin(trx, personaId);
      const cookie = `${creada.id}.${creada.token.toString('hex')}`;
      const filaInicial = await trx
        .selectFrom('sesion_admin')
        .selectAll()
        .where('id', '=', creada.id)
        .executeTakeFirstOrThrow();
      const t0 = new Date(filaInicial.ultima_actividad_en);

      const masCincuentaYNueve = new Date(t0.getTime() + 59 * 60_000);
      const resultado = await verificarSesionAdmin(trx, cookie, masCincuentaYNueve);
      expect(resultado.estado).toBe('valido');
      if (resultado.estado !== 'valido') throw new Error('unreachable');
      expect(new Date(resultado.sesion.ultima_actividad_en).getTime()).toBe(masCincuentaYNueve.getTime());
    });
  });

  it('expires after 60 minutes of inactivity (T+61 minutes)', async () => {
    await aislado(async (trx) => {
      const personaId = await crearPersonaAdmin(trx);
      const creada = await crearSesionAdmin(trx, personaId);
      const cookie = `${creada.id}.${creada.token.toString('hex')}`;
      const filaInicial = await trx
        .selectFrom('sesion_admin')
        .selectAll()
        .where('id', '=', creada.id)
        .executeTakeFirstOrThrow();
      const t0 = new Date(filaInicial.ultima_actividad_en);

      const masSesentaYUno = new Date(t0.getTime() + 61 * 60_000);
      expect(await verificarSesionAdmin(trx, cookie, masSesentaYUno)).toEqual({ estado: 'expirada' });
    });
  });

  it('throttles the ultima_actividad_en write to at most once per minute', async () => {
    await aislado(async (trx) => {
      const personaId = await crearPersonaAdmin(trx);
      const creada = await crearSesionAdmin(trx, personaId);
      const cookie = `${creada.id}.${creada.token.toString('hex')}`;
      const filaInicial = await trx
        .selectFrom('sesion_admin')
        .selectAll()
        .where('id', '=', creada.id)
        .executeTakeFirstOrThrow();
      const t0 = new Date(filaInicial.ultima_actividad_en);

      const masDiez = new Date(t0.getTime() + 10 * 60_000);
      const primera = await verificarSesionAdmin(trx, cookie, masDiez);
      expect(primera.estado).toBe('valido');
      if (primera.estado !== 'valido') throw new Error('unreachable');
      expect(new Date(primera.sesion.ultima_actividad_en).getTime()).toBe(masDiez.getTime());

      // 30 seconds later -- inside the 1-minute throttle window: no write.
      const masDiezYMedio = new Date(masDiez.getTime() + 30_000);
      const segunda = await verificarSesionAdmin(trx, cookie, masDiezYMedio);
      expect(segunda.estado).toBe('valido');
      if (segunda.estado !== 'valido') throw new Error('unreachable');
      expect(new Date(segunda.sesion.ultima_actividad_en).getTime()).toBe(masDiez.getTime());
    });
  });
});
