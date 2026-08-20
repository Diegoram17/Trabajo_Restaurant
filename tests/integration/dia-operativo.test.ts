import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';

// dia_operativo() lives exactly once, in the database (migrations/0002_*.sql,
// ADR-0028). Only a real PostgreSQL instance can prove the migrated SQL
// itself pivots at 05:00 America/Lima with no gaps or overlaps, so this is
// an integration test against TEST_DATABASE_URL, never a JS
// reimplementation of the same formula (ADR-0038).
//
// Every vector below carries an explicit -05:00 offset in the literal:
// America/Lima observes no DST, so the offset is constant year-round and
// the test needs no timezone-conversion helper of its own. 2024-06-01 is a
// Saturday and 2024-06-02 the following Sunday.
describe('dia_operativo(): the operational day pivots on 05:00 Lima time', () => {
  let pool: Pool;

  beforeAll(() => {
    loadDotEnv();
    pool = createPool(process.env.TEST_DATABASE_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function diaOperativo(instanteLima: string): Promise<string> {
    const { rows } = await pool.query<{ resultado: string }>(
      `SELECT dia_operativo($1::timestamptz)::text AS resultado`,
      [instanteLima],
    );
    const fila = rows[0];
    if (fila === undefined) {
      throw new Error('dia_operativo() returned no row for a constant SELECT with no FROM clause');
    }
    return fila.resultado;
  }

  it("Saturday 23:40 Lima falls within Saturday's operational day", async () => {
    await expect(diaOperativo('2024-06-01T23:40:00-05:00')).resolves.toBe('2024-06-01');
  });

  it("Sunday 00:30 Lima still falls within Saturday's operational day, not Sunday's", async () => {
    await expect(diaOperativo('2024-06-02T00:30:00-05:00')).resolves.toBe('2024-06-01');
  });

  it("the exact 05:00:00 cutoff already belongs to the day that is starting", async () => {
    await expect(diaOperativo('2024-06-02T05:00:00-05:00')).resolves.toBe('2024-06-02');
  });

  it("Sunday 05:01 Lima already falls within Sunday's operational day", async () => {
    await expect(diaOperativo('2024-06-02T05:01:00-05:00')).resolves.toBe('2024-06-02');
  });

  it('04:59:59 and 05:00:00 land on consecutive operational days, with no overlap', async () => {
    const beforeCutoff = await diaOperativo('2024-06-02T04:59:59-05:00');
    const atCutoff = await diaOperativo('2024-06-02T05:00:00-05:00');

    expect(beforeCutoff).toBe('2024-06-01');
    expect(atCutoff).toBe('2024-06-02');
    expect(beforeCutoff).not.toBe(atCutoff);
  });

  it('does not read configuracion_costos, calendario_apertura or configuracion_operativa (constant, not configurable)', async () => {
    const { rows } = await pool.query<{ definicion: string }>(
      `SELECT pg_get_functiondef('dia_operativo(timestamptz)'::regprocedure) AS definicion`,
    );
    const fila = rows[0];
    if (fila === undefined) {
      throw new Error('pg_get_functiondef() returned no row for a constant SELECT with no FROM clause');
    }
    const definicion = fila.definicion.toLowerCase();
    for (const tabla of ['configuracion_costos', 'calendario_apertura', 'configuracion_operativa']) {
      expect(definicion).not.toContain(tabla);
    }
  });
});
