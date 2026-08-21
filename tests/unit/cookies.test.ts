import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { COOKIE_DISPOSITIVO, COOKIE_SESION, agregarSetCookie, leerCookies } from '../../src/server/auth/cookies';

// Design "Interfaces": cookies.ts is the ONLY place that builds a cookie
// string (module map). The __Host- prefix requires Secure + Path=/ + no
// Domain (ADR-0041); attribute correctness is one edit here, not one per
// caller.

function fakeRes(): ServerResponse {
  const encabezados = new Map<string, string | string[]>();
  return {
    getHeader: (nombre: string) => encabezados.get(nombre.toLowerCase()),
    setHeader: (nombre: string, valor: string | string[]) => {
      encabezados.set(nombre.toLowerCase(), valor);
      return undefined;
    },
  } as unknown as ServerResponse;
}

function setCookieValues(res: ServerResponse): string[] {
  const valor = res.getHeader('Set-Cookie');
  if (valor === undefined) return [];
  return Array.isArray(valor) ? (valor as string[]) : [String(valor)];
}

describe('COOKIE_SESION / COOKIE_DISPOSITIVO', () => {
  it('are the exact __Host- literal names', () => {
    expect(COOKIE_SESION).toBe('__Host-sesion');
    expect(COOKIE_DISPOSITIVO).toBe('__Host-dispositivo');
  });
});

describe('agregarSetCookie', () => {
  it('emits __Host-sesion with Secure, HttpOnly, SameSite=Strict, Path=/, no Domain', () => {
    const res = fakeRes();
    agregarSetCookie(res, COOKIE_SESION, '1.abcdef', { sameSite: 'Strict' });
    const [cadena] = setCookieValues(res);
    expect(cadena).toContain('__Host-sesion=1.abcdef');
    expect(cadena).toContain('Secure');
    expect(cadena).toContain('HttpOnly');
    expect(cadena).toContain('SameSite=Strict');
    expect(cadena).toContain('Path=/');
    expect(cadena).not.toContain('Domain');
  });

  it('emits __Host-dispositivo with SameSite=Lax and the requested Max-Age', () => {
    const res = fakeRes();
    agregarSetCookie(res, COOKIE_DISPOSITIVO, '1.abcdef', { sameSite: 'Lax', maxAgeSegundos: 7_776_000 });
    const [cadena] = setCookieValues(res);
    expect(cadena).toContain('__Host-dispositivo=1.abcdef');
    expect(cadena).toContain('SameSite=Lax');
    expect(cadena).toContain('Max-Age=7776000');
    expect(cadena).not.toContain('Domain');
  });

  it('appends to an existing Set-Cookie header instead of overwriting it', () => {
    const res = fakeRes();
    agregarSetCookie(res, COOKIE_SESION, '1.abcdef', { sameSite: 'Strict' });
    agregarSetCookie(res, COOKIE_DISPOSITIVO, '2.fedcba', { sameSite: 'Lax' });
    const valores = setCookieValues(res);
    expect(valores).toHaveLength(2);
    expect(valores[0]).toContain('__Host-sesion=1.abcdef');
    expect(valores[1]).toContain('__Host-dispositivo=2.fedcba');
  });
});

describe('leerCookies', () => {
  it('parses the request Cookie header into a name -> value map', () => {
    const req = { headers: { cookie: '__Host-sesion=1.abc; otra=2' } } as unknown as Parameters<
      typeof leerCookies
    >[0];
    expect(leerCookies(req)).toEqual({ '__Host-sesion': '1.abc', otra: '2' });
  });

  it('returns {} when no Cookie header is present', () => {
    const req = { headers: {} } as unknown as Parameters<typeof leerCookies>[0];
    expect(leerCookies(req)).toEqual({});
  });
});
