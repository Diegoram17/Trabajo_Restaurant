import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { ControlledTransaction, Kysely } from 'kysely';
import { sql } from 'kysely';
import { createPool } from '../../src/server/db/pool';
import { createDb } from '../../src/server/db/kysely';
import { loadDotEnv } from '../../src/server/config/env';
import type { DB } from '../../src/server/db/schema';

// Proves the data-access spec's "row locking is reachable with no escape
// hatch" requirement: Kysely's typed `.forUpdate()` genuinely reaches
// PostgreSQL's row-level SELECT ... FOR UPDATE lock, not just that the
// method compiles. Item #9's FIFO consumption is the real future consumer
// of this exact pattern (global-setup.ts already documents ADR-0003's
// row-locking rationale).
//
// Confirming the compiled SQL merely CONTAINS "FOR UPDATE" would only
// prove syntax. This proves the stronger claim instead: a second,
// independent connection (a genuinely separate PostgreSQL session,
// acquired from the same pool) attempting the same locked SELECT is
// BLOCKED until the first transaction releases the lock. `SET LOCAL
// lock_timeout` makes that blocking assertion deterministic -- the second
// connection gives up after a short, fixed wait and PostgreSQL reports it
// via a specific error code (55P03, lock_not_available) instead of racing
// a JS-side timer against the test's own event loop.
describe('row locking: Kysely .forUpdate() reaches a real PostgreSQL row lock', () => {
  let pool: Pool;
  let db: Kysely<DB>;
  let filaId: number | undefined;

  beforeAll(() => {
    loadDotEnv();
    pool = createPool(process.env.TEST_DATABASE_URL);
    db = createDb(pool);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Inserted directly (autocommit), not inside the transactions under
    // test: the two competing transactions below are separate PostgreSQL
    // sessions and, under READ COMMITTED, neither would see an
    // uncommitted row from a third transaction. vigente_desde uses the
    // database's own now(), never a JS-side new Date() (design
    // "Interfaces" section) -- consistent with instanteSql() in
    // vigencias.ts.
    const fila = await db
      .insertInto('configuracion_costos')
      .values({
        vigente_desde: sql<Date>`now()`,
        salario_cocina: 150000,
        salario_administrativo: 200000,
        costos_indirectos_mensuales: 500000,
        pct_comision: 500,
        pct_merma: 200,
        pct_igv: 1800,
        creada_por: 1,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    filaId = fila.id;
  });

  afterEach(async () => {
    if (filaId !== undefined) {
      await db.deleteFrom('configuracion_costos').where('id', '=', filaId).execute();
      filaId = undefined;
    }
  });

  it('a second connection requesting the same SELECT ... FOR UPDATE is blocked until the first transaction ends', async () => {
    const id = filaId;
    if (id === undefined) {
      throw new Error('setup did not produce a row id');
    }

    const trxA: ControlledTransaction<DB> = await db.startTransaction().execute();
    const trxB: ControlledTransaction<DB> = await db.startTransaction().execute();
    let trxC: ControlledTransaction<DB> | undefined;

    try {
      // trxA locks the row via Kysely's typed .forUpdate() and holds the
      // lock open (no commit/rollback yet).
      const filaLockeada = await trxA
        .selectFrom('configuracion_costos')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      expect(filaLockeada.id).toBe(id);

      // trxB gives up waiting after a short, fixed timeout instead of
      // hanging forever if the lock is genuinely held.
      await sql`SET LOCAL lock_timeout = '200ms'`.execute(trxB);

      await expect(
        trxB
          .selectFrom('configuracion_costos')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirstOrThrow(),
      ).rejects.toMatchObject({ code: '55P03' }); // lock_not_available: trxA's FOR UPDATE genuinely holds the row lock

      // PostgreSQL aborts a transaction after any statement inside it
      // errors (lock_timeout's 55P03 included): trxB can only be rolled
      // back from here, never reused for another statement. Roll it back
      // now that it has already proven the blocking claim.
      await trxB.rollback().execute();

      await trxA.commit().execute();

      // Now that trxA released the lock, a fresh transaction (a third,
      // independent session) can acquire the identical FOR UPDATE lock
      // immediately -- proving the block above was caused by trxA's lock,
      // not by some other permanent failure.
      trxC = await db.startTransaction().execute();
      const filaTrasLiberar = await trxC
        .selectFrom('configuracion_costos')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      expect(filaTrasLiberar.id).toBe(id);

      await trxC.commit().execute();
    } finally {
      // Best-effort: every transaction opened above is expected to already
      // be committed or rolled back by this point on the happy path; this
      // guards against an orphaned "idle in transaction" session if an
      // assertion throws first (the same failure mode found and fixed in
      // PR 3's vigencia.test.ts). Kysely's own `.rollback()` throws
      // SYNCHRONOUSLY (not just a rejected `.execute()`) when the
      // transaction is already committed or rolled back, so each cleanup
      // needs its own try/catch rather than a `.catch()` on the promise
      // chain.
      for (const trx of [trxA, trxB, trxC]) {
        if (trx === undefined) continue;
        try {
          await trx.rollback().execute();
        } catch {
          // already committed or rolled back -- nothing to clean up
        }
      }
    }
  });
});
