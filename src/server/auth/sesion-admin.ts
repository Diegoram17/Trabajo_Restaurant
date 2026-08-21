/**
 * ADR-0043's `/admin` session table (design module map). `ResultadoSesion`
 * mirrors `ResultadoDispositivo`'s shape and the same `"{id}.{token}"`
 * construction (D3-C): `sesion_admin.id` is itself a >=128-bit CSPRNG
 * handle, not the row's insertion order, so a sequential id never leaks how
 * many sessions the system ever issued.
 */
import { type Kysely, type Selectable, sql } from 'kysely';
import { generarToken, hashearToken, tokenCoincide } from './token.js';
import type { DB } from '../db/schema.js';

export type ResultadoSesion =
  | { readonly estado: 'valido'; readonly sesion: Selectable<DB['sesion_admin']> }
  | { readonly estado: 'ausente' | 'invalido' | 'expirada' | 'revocada' };

export interface SesionCreada {
  readonly id: string;
  readonly token: Buffer;
}

/** Splits an `"{id}.{token}"` credential (D3-C). Same malformed-input
 *  contract as `dispositivo.ts`'s `analizarCookie`: an unparsable cookie is
 *  'ausente', never 'invalido' -- there is no wire-distinguishable state
 *  before the row lookup. */
function analizarCookie(cookie: string): { readonly id: string; readonly token: Buffer } | undefined {
  const separador = cookie.indexOf('.');
  if (separador <= 0 || separador === cookie.length - 1) return undefined;
  const id = cookie.slice(0, separador);
  const tokenHex = cookie.slice(separador + 1);
  if (!/^[0-9a-f]{64}$/i.test(tokenHex)) return undefined;
  return { id, token: Buffer.from(tokenHex, 'hex') };
}

const MINUTOS_INACTIVIDAD = 60;
const MINUTOS_THROTTLE_ESCRITURA = 1;

/** Creates a `sesion_admin` row for `personaId` and returns its handle plus
 *  the ONLY copy of the plaintext token -- the caller builds the
 *  `"{id}.{token}"` cookie value and emits it via `cookies.ts`. */
export async function crearSesionAdmin(db: Kysely<DB>, personaId: number): Promise<SesionCreada> {
  const id = generarToken().toString('hex');
  const token = generarToken();
  const sal = generarToken().subarray(0, 16);
  const hash = hashearToken(token, sal);
  await db
    .insertInto('sesion_admin')
    .values({ id, persona_id: personaId, token_hash: hash, token_sal: sal })
    .execute();
  return { id, token };
}

/**
 * THE single session verification path, mirroring `verificarDispositivo`.
 * Every temporal comparison happens in SQL (D3-B). `ultima_actividad_en` is
 * touched at most once per minute (D3-H), gated by the same SQL predicate
 * that decides `expirada` -- otherwise every panel read becomes a write.
 */
export async function verificarSesionAdmin(
  db: Kysely<DB>,
  cookie: string | undefined,
  ahora?: Date,
): Promise<ResultadoSesion> {
  if (cookie === undefined) return { estado: 'ausente' };
  const credencial = analizarCookie(cookie);
  if (credencial === undefined) return { estado: 'ausente' };

  const instante = ahora === undefined ? sql<Date>`now()` : sql<Date>`${ahora}::timestamptz`;

  const fila = await db
    .selectFrom('sesion_admin')
    .selectAll()
    .select([
      sql<boolean>`(ultima_actividad_en <= ${instante} - make_interval(mins => ${MINUTOS_INACTIVIDAD}))`.as(
        'expirada',
      ),
      sql<boolean>`(ultima_actividad_en <= ${instante} - make_interval(mins => ${MINUTOS_THROTTLE_ESCRITURA}))`.as(
        'debeActualizar',
      ),
    ])
    .where('id', '=', credencial.id)
    .executeTakeFirst();

  if (fila === undefined) return { estado: 'invalido' };
  if (fila.revocada_en !== null) return { estado: 'revocada' };
  if (fila.expirada) return { estado: 'expirada' };
  if (!tokenCoincide(credencial.token, fila.token_sal, fila.token_hash)) return { estado: 'invalido' };

  if (!fila.debeActualizar) {
    const { expirada: _expirada, debeActualizar: _debeActualizar, ...sesion } = fila;
    return { estado: 'valido', sesion };
  }

  const actualizada = await db
    .updateTable('sesion_admin')
    .set({ ultima_actividad_en: instante })
    .where('id', '=', credencial.id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { estado: 'valido', sesion: actualizada };
}

/** Revokes every non-revoked session of `personaId` (D3-G's building
 *  block): the caller creates a fresh session afterward, in the same
 *  transaction, when this is a rotation rather than a plain sign-out. */
export async function revocarSesionesDePersona(db: Kysely<DB>, personaId: number, ahora?: Date): Promise<void> {
  const instante = ahora === undefined ? sql<Date>`now()` : sql<Date>`${ahora}::timestamptz`;
  await db
    .updateTable('sesion_admin')
    .set({ revocada_en: instante })
    .where('persona_id', '=', personaId)
    .where('revocada_en', 'is', null)
    .execute();
}
