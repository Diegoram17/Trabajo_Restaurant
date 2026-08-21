import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';

// Item #1 shipped `creada_por` as `integer NOT NULL` WITHOUT its foreign
// key, with the debt recorded on BACKLOG row #3: "Persona does not exist
// until item #3, which adds the constraint" (migrations/0001_configuracion.sql,
// lines 10-12). This file proves the debt is repaid: authorship that does
// not resolve to a real `persona` row is rejected BY THE DATABASE
// (23503/23502), not by application code, and a resolvable `creada_por` is
// accepted. Real PostgreSQL only (ADR-0038): constraint error codes and
// names cannot be reproduced by a mock.
describe('creada_por foreign keys (migrations/0003_acceso.sql)', () => {
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

  // `vigente_desde = now()` is the one value the vigente_desde_no_retroactiva
  // trigger always accepts: it IS the current operational day.
  function insertarCostos(creadaPor: string, params: readonly unknown[]) {
    return client.query(
      `INSERT INTO configuracion_costos
        (vigente_desde, salario_cocina, salario_administrativo, costos_indirectos_mensuales, pct_comision, pct_merma, pct_igv, creada_por)
       VALUES (now(), 0, 0, 0, 500, 0, 1800, ${creadaPor})`,
      params as unknown[],
    );
  }

  function insertarCalendario(creadaPor: string, params: readonly unknown[]) {
    return client.query(
      `INSERT INTO calendario_apertura
        (vigente_desde, abre_lunes, abre_martes, abre_miercoles, abre_jueves, abre_viernes, abre_sabado, abre_domingo, creada_por)
       VALUES (now(), true, true, true, true, true, true, true, ${creadaPor})`,
      params as unknown[],
    );
  }

  it('rejects a nonexistent creada_por on configuracion_costos (FK 23503)', async () => {
    await expect(insertarCostos('$1', [999_999])).rejects.toMatchObject({
      code: '23503',
      constraint: 'configuracion_costos_creada_por_fkey',
    });
  });

  it('rejects a NULL creada_por on configuracion_costos (NOT NULL 23502)', async () => {
    await expect(insertarCostos('$1', [null])).rejects.toMatchObject({
      code: '23502',
      column: 'creada_por',
    });
  });

  it('rejects a nonexistent creada_por on calendario_apertura (FK 23503)', async () => {
    await expect(insertarCalendario('$1', [999_999])).rejects.toMatchObject({
      code: '23503',
      constraint: 'calendario_apertura_creada_por_fkey',
    });
  });

  it('rejects a NULL creada_por on calendario_apertura (NOT NULL 23502)', async () => {
    await expect(insertarCalendario('$1', [null])).rejects.toMatchObject({
      code: '23502',
      column: 'creada_por',
    });
  });

  it('accepts creada_por that resolves to an existing persona row', async () => {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO persona (nombre, rol, debe_rotar_contrasena, activo)
       VALUES ('Prueba FK', 'mesero', false, true) RETURNING id`,
    );
    const id = rows[0]?.id;
    expect(id).toBeDefined();

    await expect(insertarCostos('$1', [id])).resolves.toMatchObject({ rowCount: 1 });
    await expect(insertarCalendario('$1', [id])).resolves.toMatchObject({ rowCount: 1 });
  });
});
