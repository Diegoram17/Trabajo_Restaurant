import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { type Kysely, type Transaction } from 'kysely';
import { createPool } from '../../src/server/db/pool';
import { createDb } from '../../src/server/db/kysely';
import { loadDotEnv } from '../../src/server/config/env';
import { verificarCredencial } from '../../src/server/auth/kdf';
import { seedArranque } from '../../scripts/seed';
import type { DB } from '../../src/server/db/schema';

// Spec: system-bootstrap (specs/system-bootstrap/spec.md). `scripts/migrate.ts`
// executes static .sql verbatim and can neither compute an Argon2id hash nor
// print anything, and `creada_por` has its FK now — so the seed is a
// TypeScript step: one transaction, idempotent by construction (ON CONFLICT
// DO NOTHING / INSERT..SELECT..WHERE NOT EXISTS, never a pre-check), the
// plaintext password returned to the caller and printed only by the CLI
// entrypoint. Real PostgreSQL only (ADR-0038).
//
// Isolation uses the callback transaction form (`db.transaction().execute`)
// rather than a ControlledTransaction: `seedArranque` opens its own
// transaction, and only the callback form nests that as a SAVEPOINT; the
// body always ends in `trx.rollback()`, so nothing commits.
describe('seedArranque (spec: system-bootstrap)', () => {
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

  /** Sentinel thrown after the body to force ROLLBACK in the callback
   *  transaction form (Kysely 0.29's callback `Transaction` has no
   *  `rollback()` method — only `startTransaction`'s ControlledTransaction
   *  does, and that one cannot host `seedArranque`'s own transaction). */
  class CuerpoCompleto extends Error {}

  /** Runs the body inside one transaction that ALWAYS rolls back. */
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

  /** Empties the seeded surface inside the current transaction: the test's
   *  own ROLLBACK restores whatever was there, including the global fixture. */
  async function limpiar(trx: Transaction<DB>): Promise<void> {
    await trx.deleteFrom('configuracion_costos').execute();
    await trx.deleteFrom('calendario_apertura').execute();
    await trx.deleteFrom('calendario_apertura_excepcion').execute();
    await trx.deleteFrom('configuracion_operativa').execute();
    await trx.deleteFrom('persona').execute();
  }

  it('clean seed: exactly one admin and three configuration rows with resolvable creada_por', async () => {
    await aislado(async (trx) => {
      await limpiar(trx);
      const resultado = await seedArranque(trx);
      expect(resultado.creado).toBe(true);
      expect(resultado.contrasena).toBeDefined();

      const personas = await trx.selectFrom('persona').selectAll().execute();
      expect(personas).toHaveLength(1);
      const admin = personas[0]!;
      expect(admin).toMatchObject({
        rol: 'administrador',
        usuario: 'admin',
        debe_rotar_contrasena: true,
        activo: true,
      });
      expect(admin.contrasena_hash).toBeDefined();

      // The returned plaintext is the password that actually verifies.
      await expect(verificarCredencial(resultado.contrasena!, admin.contrasena_hash!)).resolves.toBe(true);

      const costos = await trx.selectFrom('configuracion_costos').selectAll().execute();
      expect(costos).toHaveLength(1);
      expect(costos[0]).toMatchObject({
        pct_igv: 1800,
        pct_comision: 500,
        pct_merma: 0,
        salario_cocina: 0,
        salario_administrativo: 0,
        costos_indirectos_mensuales: 0,
      });
      expect(costos[0]!.creada_por).toBe(admin.id);

      const calendario = await trx.selectFrom('calendario_apertura').selectAll().execute();
      expect(calendario).toHaveLength(1);
      expect(calendario[0]).toMatchObject({
        abre_lunes: true,
        abre_martes: true,
        abre_miercoles: true,
        abre_jueves: true,
        abre_viernes: true,
        abre_sabado: true,
        abre_domingo: true,
      });
      expect(calendario[0]!.creada_por).toBe(admin.id);

      const operativa = await trx.selectFrom('configuracion_operativa').selectAll().execute();
      expect(operativa).toHaveLength(1);
      expect(operativa[0]).toMatchObject({ umbral_demora_min: 15, inactividad_sesion_min: 5 });
    });
  });

  it('seed creates zero devices and zero kitchen credentials', async () => {
    await aislado(async (trx) => {
      await limpiar(trx);
      await seedArranque(trx);

      const dispositivos = await trx.selectFrom('dispositivo').selectAll().execute();
      expect(dispositivos).toHaveLength(0);

      // CredencialCocina is item #11's table: it does not exist yet, and a
      // table that does not exist holds zero rows by construction. Asserting
      // the absence (instead of querying it) keeps this spec executable today
      // and stays honest: the day #11 creates it, this assertion must be
      // replaced by a row count.
      const tablas = (await trx
        .selectFrom('information_schema.tables' as never)
        .select('table_name' as never)
        .execute()) as unknown as { table_name: string }[];
      expect(tablas.map((t) => t.table_name)).not.toContain('credencial_cocina');
    });
  });

  it('re-running against a seeded database is a no-op that reprints nothing', async () => {
    await aislado(async (trx) => {
      await limpiar(trx);
      await seedArranque(trx);

      const segunda = await seedArranque(trx);
      expect(segunda.creado).toBe(false);
      expect(segunda.contrasena).toBeUndefined();

      // Nothing was duplicated or modified.
      expect(await trx.selectFrom('persona').selectAll().execute()).toHaveLength(1);
      expect(await trx.selectFrom('configuracion_costos').selectAll().execute()).toHaveLength(1);
      expect(await trx.selectFrom('calendario_apertura').selectAll().execute()).toHaveLength(1);
      expect(await trx.selectFrom('configuracion_operativa').selectAll().execute()).toHaveLength(1);
    });
  });

  it('regenerarContrasena re-arms debe_rotar_contrasena and returns a new verifying password', async () => {
    await aislado(async (trx) => {
      await limpiar(trx);
      const primera = await seedArranque(trx);
      // Simulate a completed first-login rotation.
      await trx.updateTable('persona').set({ debe_rotar_contrasena: false }).execute();

      const regenerada = await seedArranque(trx, { regenerarContrasena: true });
      expect(regenerada.creado).toBe(false);
      expect(regenerada.contrasena).toBeDefined();
      expect(regenerada.contrasena).not.toBe(primera.contrasena);

      const admin = (await trx.selectFrom('persona').selectAll().execute())[0]!;
      expect(admin.debe_rotar_contrasena).toBe(true);
      await expect(verificarCredencial(regenerada.contrasena!, admin.contrasena_hash!)).resolves.toBe(true);
    });
  });

  it('an explicit contrasena option seeds exactly that password (fixture path)', async () => {
    await aislado(async (trx) => {
      await limpiar(trx);
      const resultado = await seedArranque(trx, { contrasena: 'palangana-linterna-42' });
      expect(resultado.contrasena).toBe('palangana-linterna-42');
      const admin = (await trx.selectFrom('persona').selectAll().execute())[0]!;
      await expect(verificarCredencial('palangana-linterna-42', admin.contrasena_hash!)).resolves.toBe(true);
    });
  });
});
