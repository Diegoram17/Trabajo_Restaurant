import { type Kysely, type Selectable, sql } from 'kysely';
import type { DB } from '../db/schema.js';

/**
 * Effective-period resolution (spec: vigencia-resolution, design D2-H). A
 * discriminated union, never `T | undefined`: `?? 0` on an absent value
 * would read as a real profit figure with a zero inside it (TECH-DESIGN
 * 833). The union forces every caller to branch explicitly on the
 * `sin_vigencia` case instead of quietly substituting a default.
 */
export type Vigencia<T> = { readonly estado: 'vigente'; readonly valor: T } | { readonly estado: 'sin_vigencia' };

function comoVigencia<T>(fila: T | undefined): Vigencia<T> {
  return fila === undefined ? { estado: 'sin_vigencia' } : { estado: 'vigente', valor: fila };
}

/**
 * The instant to resolve against, as a bound SQL expression: `momento` when
 * given, or the database's own `now()` otherwise. Deliberately never `new
 * Date()` on the Node side -- two clocks would mean a different operational
 * day per layer (design "Interfaces" section). Passed through `${}`, so it
 * always travels as a bound driver parameter, never interpolated into the
 * query text (ADR-0039).
 */
function instanteSql(momento: Date | undefined) {
  return momento === undefined ? sql<Date>`now()` : sql<Date>`${momento}::timestamptz`;
}

/**
 * The row governing `momento` (default: now) in `configuracion_costos`: the
 * highest `vigente_desde` whose operational day has already arrived, per
 * `dia_operativo(vigente_desde) <= dia_operativo(momento)` -- comparing
 * operational days, never raw timestamps or calendar dates (spec
 * vigencia-resolution). `UNIQUE (vigente_desde)` gives a total order, so
 * `ORDER BY vigente_desde DESC LIMIT 1` never needs an arbitrary tie-break.
 */
export async function configuracionCostosVigente(
  db: Kysely<DB>,
  momento?: Date,
): Promise<Vigencia<Selectable<DB['configuracion_costos']>>> {
  const fila = await db
    .selectFrom('configuracion_costos')
    .selectAll()
    .where(sql<boolean>`dia_operativo(vigente_desde) <= dia_operativo(${instanteSql(momento)})`)
    .orderBy('vigente_desde', 'desc')
    .limit(1)
    .executeTakeFirst();
  return comoVigencia(fila);
}

/** Same algorithm as {@link configuracionCostosVigente}, over `calendario_apertura`. */
export async function calendarioAperturaVigente(
  db: Kysely<DB>,
  momento?: Date,
): Promise<Vigencia<Selectable<DB['calendario_apertura']>>> {
  const fila = await db
    .selectFrom('calendario_apertura')
    .selectAll()
    .where(sql<boolean>`dia_operativo(vigente_desde) <= dia_operativo(${instanteSql(momento)})`)
    .orderBy('vigente_desde', 'desc')
    .limit(1)
    .executeTakeFirst();
  return comoVigencia(fila);
}
