/**
 * ADR-0036's device lifecycle (design module map). This batch (BACKLOG #3
 * PR 2) implements ONLY `verificarDispositivo` -- item #4's SSE `GET` entry
 * point (design "Interfaces"). Enrol, rotate and revoke land in Phase 5.
 */
import { type Kysely, type Selectable, sql } from 'kysely';
import { tokenCoincide } from './token.js';
import type { DB } from '../db/schema.js';

export type ResultadoDispositivo =
  | { readonly estado: 'valido'; readonly dispositivo: Selectable<DB['dispositivo']>; readonly renovada: boolean }
  | { readonly estado: 'ausente' | 'invalido' | 'vencido' | 'revocado' };

/**
 * Splits an `"{id}.{token}"` credential (design D3-C). Malformed input
 * (missing separator, non-numeric id, wrong-length/non-hex token) has no
 * wire-distinguishable state before the row lookup, so it classifies as
 * 'ausente' upstream -- same bucket as a genuinely missing cookie.
 */
function analizarCookie(cookie: string): { readonly id: number; readonly token: Buffer } | undefined {
  const separador = cookie.indexOf('.');
  if (separador <= 0 || separador === cookie.length - 1) return undefined;
  const idTexto = cookie.slice(0, separador);
  const tokenHex = cookie.slice(separador + 1);
  if (!/^\d+$/.test(idTexto) || !/^[0-9a-f]{64}$/i.test(tokenHex)) return undefined;
  return { id: Number(idTexto), token: Buffer.from(tokenHex, 'hex') };
}

/** The write bound (design "Sequence -- verify and renew"): after a
 *  renewal `expira_en` sits `DIAS_EXPIRACION` days out, so `renovable`
 *  cannot become true again until the clock advances past
 *  `DIAS_EXPIRACION - UMBRAL_RENOVACION_DIAS` days -- at most one write
 *  per device per day, with no extra column. */
const DIAS_EXPIRACION = 90;
const UMBRAL_RENOVACION_DIAS = 89;

/**
 * THE single device verification path (proposal Q9, design "Interfaces").
 * Every temporal comparison happens in SQL (D3-B): `ahora` substitutes
 * `now()` only for tests, so Node never compares against its own clock.
 */
export async function verificarDispositivo(
  db: Kysely<DB>,
  cookie: string | undefined,
  ahora?: Date,
): Promise<ResultadoDispositivo> {
  if (cookie === undefined) return { estado: 'ausente' };
  const credencial = analizarCookie(cookie);
  if (credencial === undefined) return { estado: 'ausente' };

  const instante = ahora === undefined ? sql<Date>`now()` : sql<Date>`${ahora}::timestamptz`;

  const fila = await db
    .selectFrom('dispositivo')
    .selectAll()
    .select([
      sql<boolean>`(expira_en <= ${instante})`.as('vencido'),
      sql<boolean>`(expira_en < ${instante} + make_interval(days => ${UMBRAL_RENOVACION_DIAS}))`.as('renovable'),
    ])
    .where('id', '=', credencial.id)
    .executeTakeFirst();

  if (fila === undefined) return { estado: 'invalido' };
  if (fila.revocado_en !== null) return { estado: 'revocado' };
  if (fila.vencido) return { estado: 'vencido' };
  if (!tokenCoincide(credencial.token, fila.token_sal, fila.token_hash)) return { estado: 'invalido' };

  if (!fila.renovable) {
    const { vencido: _vencido, renovable: _renovable, ...dispositivo } = fila;
    return { estado: 'valido', dispositivo, renovada: false };
  }

  const renovadoHasta = sql<Date>`${instante} + make_interval(days => ${DIAS_EXPIRACION})`;
  const actualizado = await db
    .updateTable('dispositivo')
    .set({ expira_en: renovadoHasta })
    .where('id', '=', credencial.id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { estado: 'valido', dispositivo: actualizado, renovada: true };
}
