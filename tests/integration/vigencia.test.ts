import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { type ControlledTransaction, type Kysely, sql } from 'kysely';
import { createPool } from '../../src/server/db/pool';
import { createDb } from '../../src/server/db/kysely';
import { calendarioAperturaVigente, configuracionCostosVigente } from '../../src/server/domain/vigencias';
import { loadDotEnv } from '../../src/server/config/env';
import type { DB } from '../../src/server/db/schema';

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

// Effective-row resolution (spec: vigencia-resolution) -- "which row governs
// the current operational day" for configuracion_costos and
// calendario_apertura, independently. Task 3.4/design D2-H: a discriminated
// Vigencia<T> union, never `T | undefined`, and `momento` makes every
// boundary case deterministic without touching the machine clock (design
// "Interfaces" section) -- every test below passes an explicit `momento`
// except the one that proves the default `now()` path.
//
// Every vigente_desde inserted below is anchored to TODAY's real operational
// day (or later): the vigente_desde_no_retroactiva trigger from
// migrations/0002_*.sql (proven above) rejects any INSERT whose operational
// day precedes dia_operativo(now()), so a fixed illustrative past date (e.g.
// a 2024 literal) would be rejected as retroactive by the very trigger these
// tests run alongside. These tests exercise the READ side instead: `momento`
// is a query-time parameter, free to be any date, so "several past versions"
// and "a past momento" below are built entirely from `momento` values placed
// AFTER today, never from vigente_desde values placed before it.
describe('vigencia resolution: the effective row for a given momento (spec: vigencia-resolution)', () => {
  let pool: Pool;
  let db: Kysely<DB>;
  let trx: ControlledTransaction<DB>;

  beforeAll(() => {
    loadDotEnv();
    pool = createPool(process.env.TEST_DATABASE_URL);
    db = createDb(pool);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    trx = await db.startTransaction().execute();
  });

  afterEach(async () => {
    // `rollback()` returns a `Command`, not a promise: it does nothing
    // (and never releases the connection back to the pool) until `.execute()`
    // is called on it.
    await trx.rollback().execute();
  });

  /** Start of TODAY's operational day, fetched from PostgreSQL's own
   *  dia_operativo(now()) -- never reimplemented in JS (ADR-0028). Every
   *  test below builds its vigente_desde values as hour offsets from this
   *  instant, so they always land on or after today and the trigger never
   *  rejects an insert. */
  async function inicioDeHoy(): Promise<Date> {
    const { rows } = await sql<{ inicio: Date }>`
      SELECT ((dia_operativo(now())::timestamp + interval '5 hours') AT TIME ZONE 'America/Lima') AS inicio
    `.execute(trx);
    const fila = rows[0];
    if (fila === undefined) {
      throw new Error('operational-day-start query returned no row for a constant SELECT with no FROM clause');
    }
    return fila.inicio;
  }

  function horasDespues(instante: Date, horas: number): Date {
    return new Date(instante.getTime() + horas * 60 * 60 * 1000);
  }

  function insertarConfiguracionCostos(vigenteDesde: Date) {
    return trx
      .insertInto('configuracion_costos')
      .values({
        vigente_desde: vigenteDesde,
        salario_cocina: 150000,
        salario_administrativo: 200000,
        costos_indirectos_mensuales: 500000,
        pct_comision: 500,
        pct_merma: 200,
        pct_igv: 1800,
        creada_por: 1,
      })
      .execute();
  }

  function insertarCalendarioApertura(vigenteDesde: Date) {
    return trx
      .insertInto('calendario_apertura')
      .values({
        vigente_desde: vigenteDesde,
        abre_lunes: true,
        abre_martes: true,
        abre_miercoles: true,
        abre_jueves: true,
        abre_viernes: true,
        abre_sabado: false,
        abre_domingo: false,
        creada_por: 1,
      })
      .execute();
  }

  it('empty table resolves to sin_vigencia, with no default value substituted', async () => {
    const hoy = await inicioDeHoy();
    const resultado = await configuracionCostosVigente(trx, horasDespues(hoy, 240));
    expect(resultado).toEqual({ estado: 'sin_vigencia' });
  });

  it('several effective versions exist: the highest vigente_desde not exceeding momento is chosen', async () => {
    const hoy = await inicioDeHoy();
    const diaUno = hoy;
    const diaDos = horasDespues(hoy, 24);
    const diaTres = horasDespues(hoy, 48);
    const momento = horasDespues(hoy, 82); // well past diaTres' own operational day

    await insertarConfiguracionCostos(diaUno);
    await insertarConfiguracionCostos(diaDos);
    await insertarConfiguracionCostos(diaTres);

    const resultado = await configuracionCostosVigente(trx, momento);
    expect(resultado.estado).toBe('vigente');
    expect(resultado.estado === 'vigente' && resultado.valor.vigente_desde).toEqual(diaTres);
  });

  it("a future effective version is excluded even though its raw calendar date matches momento's", async () => {
    const hoy = await inicioDeHoy();
    const diaDos = horasDespues(hoy, 24);
    const diaTres = horasDespues(hoy, 48);
    // 21h after diaDos' start lands at 02:00 the following civil day --
    // still inside diaDos' own operational day (which ends where diaTres
    // begins, exclusive).
    const momento = horasDespues(diaDos, 21);

    // Same raw calendar date as momento (both fall on the civil date diaTres
    // starts on), but its operational day IS diaTres -- one day AFTER
    // momento's operational day (diaDos). Comparing against the raw
    // calendar date instead of dia_operativo() on both sides would wrongly
    // include this row.
    await insertarConfiguracionCostos(horasDespues(diaTres, 1));
    // The genuinely eligible row, inside momento's own operational day.
    await insertarConfiguracionCostos(horasDespues(diaDos, 5));

    const resultado = await configuracionCostosVigente(trx, momento);
    expect(resultado.estado).toBe('vigente');
    expect(resultado.estado === 'vigente' && resultado.valor.vigente_desde).toEqual(horasDespues(diaDos, 5));
  });

  it('two effective versions on the same operational day are disambiguated by the highest vigente_desde', async () => {
    const hoy = await inicioDeHoy();
    const temprano = horasDespues(hoy, 1);
    const tarde = horasDespues(hoy, 15); // still hoy's own operational day
    const momento = horasDespues(hoy, 82);

    await insertarConfiguracionCostos(temprano);
    await insertarConfiguracionCostos(tarde);

    const resultado = await configuracionCostosVigente(trx, momento);
    expect(resultado.estado).toBe('vigente');
    expect(resultado.estado === 'vigente' && resultado.valor.vigente_desde).toEqual(tarde);
  });

  it('a past momento returns the row that governed then, not the one that governs at a later momento', async () => {
    const hoy = await inicioDeHoy();
    const diaUno = horasDespues(hoy, 3);
    const diaTres = horasDespues(hoy, 51); // two operational days later, +3h

    await insertarConfiguracionCostos(diaUno);
    await insertarConfiguracionCostos(diaTres);

    // Between the two versions' operational days: only the first had taken
    // effect yet.
    const momentoIntermedio = horasDespues(hoy, 34);
    const resultado = await configuracionCostosVigente(trx, momentoIntermedio);
    expect(resultado.estado).toBe('vigente');
    expect(resultado.estado === 'vigente' && resultado.valor.vigente_desde).toEqual(diaUno);
  });

  it("with no momento argument, resolves against the database's own now() by default", async () => {
    const hoy = await inicioDeHoy();
    // Exactly at today's boundary: dia_operativo(vigente_desde) ==
    // dia_operativo(now()), the equality case the trigger itself accepts.
    await insertarConfiguracionCostos(hoy);

    const resultado = await configuracionCostosVigente(trx);
    expect(resultado.estado).toBe('vigente');
    expect(resultado.estado === 'vigente' && resultado.valor.salario_cocina).toBe(150000);
  });

  it('calendarioAperturaVigente resolves the same algorithm on the second table', async () => {
    const hoy = await inicioDeHoy();
    const anterior = hoy;
    const vigente = horasDespues(hoy, 25);
    const momento = horasDespues(hoy, 82);

    await insertarCalendarioApertura(anterior);
    await insertarCalendarioApertura(vigente);

    const resultado = await calendarioAperturaVigente(trx, momento);
    expect(resultado.estado).toBe('vigente');
    expect(resultado.estado === 'vigente' && resultado.valor.vigente_desde).toEqual(vigente);
  });

  it('calendarioAperturaVigente resolves to sin_vigencia on an empty table', async () => {
    const hoy = await inicioDeHoy();
    const resultado = await calendarioAperturaVigente(trx, horasDespues(hoy, 240));
    expect(resultado).toEqual({ estado: 'sin_vigencia' });
  });
});
