/**
 * The ONLY module that builds a cookie string (design module map): a future
 * attribute correction is one edit here, never one edit per caller. Both
 * `/admin` session and device credentials are `__Host-` cookies (ADR-0041):
 * the prefix requires Secure + Path=/ + no Domain, all three hardcoded here
 * so nothing downstream can omit one and silently widen scope.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseCookie, stringifySetCookie } from 'cookie';

export const COOKIE_SESION = '__Host-sesion';
export const COOKIE_DISPOSITIVO = '__Host-dispositivo';

/** Parses the request's `Cookie` header. An absent header is `{}`, not an error. */
export function leerCookies(req: IncomingMessage): Record<string, string | undefined> {
  const encabezado = req.headers.cookie;
  return encabezado === undefined ? {} : parseCookie(encabezado);
}

export interface OpcionesCookie {
  readonly sameSite: 'Strict' | 'Lax';
  readonly maxAgeSegundos?: number;
}

/**
 * Appends ONE Set-Cookie header value instead of overwriting it:
 * `res.setHeader('Set-Cookie', x)` called twice keeps only the SECOND
 * value -- a response that refreshes both the session and the device
 * cookie in the same request would silently drop one credential.
 */
export function agregarSetCookie(res: ServerResponse, nombre: string, valor: string, opciones: OpcionesCookie): void {
  const cadena = stringifySetCookie({
    name: nombre,
    value: valor,
    secure: true,
    httpOnly: true,
    path: '/',
    sameSite: opciones.sameSite === 'Strict' ? 'strict' : 'lax',
    maxAge: opciones.maxAgeSegundos,
  });
  const existente = res.getHeader('Set-Cookie');
  const acumuladas =
    existente === undefined ? [cadena] : [...(Array.isArray(existente) ? existente : [String(existente)]), cadena];
  res.setHeader('Set-Cookie', acumuladas);
}
