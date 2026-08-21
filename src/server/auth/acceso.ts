/**
 * The single pipeline step that composes access resolution (design
 * "Technical approach", D3-K): `resolverAcceso` runs ONCE, unconditionally,
 * between the Origin guard and dispatch -- the `origin-guard.ts` lesson
 * (an opt-in is forgotten by the next procedure). tRPC's `createContext`
 * (`src/server/trpc/context.ts`) and item #4's SSE `GET` are its two call
 * sites; neither adds its own rule.
 *
 * The returned `Context` carries request-scoped authorization, re-resolved
 * on every request and never memoized (D2-G): a device/session row read for
 * THIS request and discarded with it is not a second source of truth.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Kysely } from 'kysely';
import { resolveClientIp } from './ip-cliente.js';
import { COOKIE_DISPOSITIVO, COOKIE_SESION, agregarSetCookie, leerCookies, type OpcionesCookie } from './cookies.js';
import { verificarDispositivo, type ResultadoDispositivo } from './dispositivo.js';
import { verificarSesionAdmin, type ResultadoSesion } from './sesion-admin.js';
import type { DB } from '../db/schema.js';

/**
 * The tRPC/SSE-shared access context (design "Interfaces"). `cookies.emitir`
 * takes the cookie name so it can serve either credential: the design's
 * illustrative one-argument `emitir(valor)` under-specifies which of
 * `COOKIE_SESION`/`COOKIE_DISPOSITIVO` (and which `SameSite`/`Max-Age`) is
 * being set -- this fills that gap with `agregarSetCookie`'s own already
 * fully-specified shape, so "attribute correctness is one edit" still holds
 * with zero duplication in the Phase 3/5 callers that use it.
 */
export interface Context {
  readonly db: Kysely<DB>;
  readonly ip: string;
  readonly dispositivo: ResultadoDispositivo;
  readonly sesion: ResultadoSesion;
  readonly cookies: {
    /** Appends one Set-Cookie value; never overwrites (`cookies.ts`'s own contract). */
    emitir(nombre: string, valor: string, opciones: OpcionesCookie): void;
  };
}

/**
 * Resolves `ip`, `dispositivo` and `sesion` for one request and returns a
 * `Context` bound to `res` for cookie emission. `ahora` only ever travels
 * through for tests (D3-B): production code always leaves it undefined and
 * every downstream comparison happens in SQL against `now()`.
 */
export async function resolverAcceso(
  db: Kysely<DB>,
  req: IncomingMessage,
  res: ServerResponse,
  hops: number,
  ahora?: Date,
): Promise<Context> {
  const ip = resolveClientIp(req, hops);
  const cookiesLeidas = leerCookies(req);

  const [dispositivo, sesion] = await Promise.all([
    verificarDispositivo(db, cookiesLeidas[COOKIE_DISPOSITIVO], ahora),
    verificarSesionAdmin(db, cookiesLeidas[COOKIE_SESION], ahora),
  ]);

  return {
    db,
    ip,
    dispositivo,
    sesion,
    cookies: {
      emitir: (nombre, valor, opciones) => agregarSetCookie(res, nombre, valor, opciones),
    },
  };
}
