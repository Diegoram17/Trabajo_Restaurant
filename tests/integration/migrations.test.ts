import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/server/db/pool';
import { runMigrations } from '../../scripts/migrate';
import { loadDotEnv } from '../../src/server/config/env';

// Runs against the real, dedicated TEST_DATABASE_URL — never
// trabajo_restaurant_dev. ADR-0038 requires real PostgreSQL: no mock can
// stand in for the schema DDL itself or for the row-locking behaviour
// (`SELECT ... FOR UPDATE`, ADR-0003) later items depend on.
describe('migrations: base configuration schema', () => {
  let pool: Pool;

  const TABLES = [
    'configuracion_costos',
    'calendario_apertura',
    'calendario_apertura_excepcion',
    'configuracion_operativa',
  ] as const;

  beforeAll(async () => {
    loadDotEnv();
    pool = createPool(process.env.TEST_DATABASE_URL);
    // Drop to a genuinely clean database first so this test proves
    // migration behaviour from scratch, independent of whatever
    // `tests/setup/global-setup.ts` already applied once for the whole run.
    // The two functions 0002 creates are not owned by any table, so
    // `DROP TABLE ... CASCADE` never reaches them: drop them explicitly
    // (CASCADE takes their triggers with them) or a second run of this
    // suite finds them still on disk and 0002's `CREATE FUNCTION` fails
    // with "already exists" instead of genuinely re-applying from scratch.
    await pool.query(
      `DROP FUNCTION IF EXISTS vigencia_no_retroactiva() CASCADE;
       DROP FUNCTION IF EXISTS dia_operativo(timestamptz) CASCADE;
       DROP TABLE IF EXISTS calendario_apertura_excepcion, calendario_apertura, configuracion_costos, configuracion_operativa, schema_migrations CASCADE`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('(a) applies every migration against a clean database: tables exist, 0 rows each', async () => {
    const applied = await runMigrations(pool);
    expect(applied).toEqual(['0001_configuracion.sql', '0002_dia_operativo_y_vigencia.sql']);

    for (const table of TABLES) {
      const { rows } = await pool.query(`SELECT count(*)::int AS count FROM ${table}`);
      expect(rows[0].count).toBe(0);
    }
  });

  it('(b) re-running the migration is a no-op: no error, no schema change', async () => {
    const before = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_name = ANY($1) ORDER BY table_name, column_name`,
      [TABLES],
    );

    const applied = await runMigrations(pool);
    expect(applied).toEqual([]);

    const after = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_name = ANY($1) ORDER BY table_name, column_name`,
      [TABLES],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('(c) rejects a fractional value in a money column as a type mismatch', async () => {
    await expect(
      pool.query(
        `INSERT INTO configuracion_costos
          (vigente_desde, salario_cocina, salario_administrativo, costos_indirectos_mensuales, pct_comision, pct_merma, pct_igv, creada_por)
         VALUES (now(), $1, 200000, 500000, 500, 200, 1800, 1)`,
        [150000.5],
      ),
    ).rejects.toThrow(/invalid input syntax for type integer/);
  });

  it('(d) vigente_desde and creada_en are timestamptz on both versioned tables', async () => {
    const { rows } = await pool.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
       WHERE table_name IN ('configuracion_costos', 'calendario_apertura')
         AND column_name IN ('vigente_desde', 'creada_en')`,
    );
    expect(rows).toHaveLength(4);
    for (const row of rows as Array<{ data_type: string }>) {
      expect(row.data_type).toBe('timestamp with time zone');
    }
  });

  it('(e) has no CHECK constraint mentioning vigente_desde -- item #2 enforces it with a trigger instead', async () => {
    const { rows: checks } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid IN ('configuracion_costos'::regclass, 'calendario_apertura'::regclass) AND contype = 'c'`,
    );
    expect(checks.some((row: { def: string }) => row.def.includes('vigente_desde'))).toBe(false);

    // 0002_dia_operativo_y_vigencia.sql attaches one BEFORE trigger per
    // table (same function, per design decision P1): a CHECK re-evaluates
    // on every UPDATE and breaks pg_restore over historical rows, so the
    // temporal rule is enforced here, never as a CHECK on vigente_desde.
    const { rows: triggers } = await pool.query(
      `SELECT DISTINCT trigger_name, event_object_table FROM information_schema.triggers
       WHERE event_object_table IN ('configuracion_costos', 'calendario_apertura')`,
    );
    expect(triggers).toHaveLength(2);
    for (const row of triggers as Array<{ trigger_name: string }>) {
      expect(row.trigger_name).toBe('vigente_desde_no_retroactiva');
    }
  });

  it('(f) rejects a null creada_por on the NOT NULL constraint', async () => {
    await expect(
      pool.query(
        `INSERT INTO configuracion_costos
          (vigente_desde, salario_cocina, salario_administrativo, costos_indirectos_mensuales, pct_comision, pct_merma, pct_igv, creada_por)
         VALUES (now(), 150000, 200000, 500000, 500, 200, 1800, $1)`,
        [null],
      ),
    ).rejects.toThrow(/null value in column "creada_por"/);
  });

  it('(g) carries no DEFAULT on any configuration parameter column', async () => {
    const parameterColumns = new Set([
      'salario_cocina',
      'salario_administrativo',
      'costos_indirectos_mensuales',
      'pct_comision',
      'pct_merma',
      'pct_igv',
      'abre_lunes',
      'abre_martes',
      'abre_miercoles',
      'abre_jueves',
      'abre_viernes',
      'abre_sabado',
      'abre_domingo',
      'umbral_demora_min',
      'inactividad_sesion_min',
    ]);

    const { rows } = await pool.query(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name IN ('configuracion_costos', 'calendario_apertura', 'configuracion_operativa')`,
    );

    const checked = (rows as Array<{ column_name: string; column_default: string | null }>).filter((row) =>
      parameterColumns.has(row.column_name),
    );
    expect(checked).toHaveLength(parameterColumns.size);
    for (const row of checked) {
      expect(row.column_default).toBeNull();
    }
  });
});
