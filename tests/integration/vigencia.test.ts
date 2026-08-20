import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';

// The vigente_desde_no_retroactiva trigger (migrations/0002_*.sql) is the
// database-level enforcement item #1 deliberately deferred: it shipped
// vigente_desde as timestamptz NOT NULL with no temporal CHECK because no
// row and no write path existed yet to exercise the rule (ADR-0022,
// refined by ADR-0028). Real PostgreSQL only (ADR-0038): no mock can
// reproduce a BEFORE trigger's error code and constraint name.
//
// Every test runs inside its own transaction that always ends in ROLLBACK,
// so both versioned tables stay empty afterward — the same invariant
// tests/integration/migrations.test.ts already relies on. creada_por has
// no FK yet (arrives with item #3): these are plain integer literals.
describe('vigente_desde_no_retroactiva: the database rejects a retroactive vigente_desde', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(() => {
    loadDotEnv();
    pool = createPool(process.env.TEST_DATABASE_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  /** Start of today's operational day (05:00 Lima), computed entirely in
   *  SQL so the boundary vectors below never depend on a JS-side
   *  reimplementation of dia_operativo(). */
  async function inicioDeHoy(): Promise<string> {
    const { rows } = await client.query<{ inicio: string }>(
      `SELECT ((dia_operativo(now())::timestamp + interval '5 hours') AT TIME ZONE 'America/Lima')::text AS inicio`,
    );
    const fila = rows[0];
    if (fila === undefined) {
      throw new Error('start-of-day query returned no row for a constant SELECT with no FROM clause');
    }
    return fila.inicio;
  }

  function insertarConfiguracionCostos(vigenteDesdeSql: string, params: readonly unknown[]) {
    return client.query(
      `INSERT INTO configuracion_costos
        (vigente_desde, salario_cocina, salario_administrativo, costos_indirectos_mensuales, pct_comision, pct_merma, pct_igv, creada_por)
       VALUES (${vigenteDesdeSql}, 150000, 200000, 500000, 500, 200, 1800, 1)`,
      params as unknown[],
    );
  }

  function insertarCalendarioApertura(vigenteDesdeSql: string, params: readonly unknown[]) {
    return client.query(
      `INSERT INTO calendario_apertura
        (vigente_desde, abre_lunes, abre_martes, abre_miercoles, abre_jueves, abre_viernes, abre_sabado, abre_domingo, creada_por)
       VALUES (${vigenteDesdeSql}, true, true, true, true, true, false, false, 1)`,
      params as unknown[],
    );
  }

  it("rejects a vigente_desde one second before today's operational day start", async () => {
    // Deliberately shares its raw Lima calendar date with "today" (it is
    // 04:59:59 on that same date) while landing in the PREVIOUS operational
    // day — exactly the case the trigger must not get wrong by comparing
    // raw calendar dates instead of dia_operativo() on both sides.
    const inicio = await inicioDeHoy();
    await expect(
      insertarConfiguracionCostos("$1::timestamptz - interval '1 second'", [inicio]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'vigente_desde_no_retroactiva' });
  });

  it("accepts a vigente_desde exactly at today's operational day start", async () => {
    const inicio = await inicioDeHoy();
    await expect(insertarConfiguracionCostos('$1::timestamptz', [inicio])).resolves.toMatchObject({
      rowCount: 1,
    });
  });

  it('accepts an UPDATE of another column, leaving vigente_desde untouched', async () => {
    const inicio = await inicioDeHoy();
    await insertarConfiguracionCostos('$1::timestamptz', [inicio]);

    await expect(
      client.query(`UPDATE configuracion_costos SET salario_cocina = $1 WHERE vigente_desde = $2::timestamptz`, [
        160000,
        inicio,
      ]),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('also rejects a retroactive vigente_desde on calendario_apertura (same function, second table)', async () => {
    const inicio = await inicioDeHoy();
    await expect(
      insertarCalendarioApertura("$1::timestamptz - interval '1 second'", [inicio]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'vigente_desde_no_retroactiva' });
  });

  it('freezes P1: no CHECK constraint mentions dia_operativo — the mechanism is a trigger', async () => {
    const { rows: checks } = await client.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid IN ('configuracion_costos'::regclass, 'calendario_apertura'::regclass) AND contype = 'c'`,
    );
    expect(checks.some((row) => row.def.includes('dia_operativo'))).toBe(false);

    const { rows: triggers } = await client.query<{ trigger_name: string; event_object_table: string }>(
      `SELECT DISTINCT trigger_name, event_object_table FROM information_schema.triggers
       WHERE event_object_table IN ('configuracion_costos', 'calendario_apertura')
         AND trigger_name = 'vigente_desde_no_retroactiva'`,
    );
    expect(triggers.map((row) => row.event_object_table).sort()).toEqual([
      'calendario_apertura',
      'configuracion_costos',
    ]);
  });
});
