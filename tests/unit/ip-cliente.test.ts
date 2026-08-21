import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { IP_DESCONOCIDA, resolveClientIp } from '../../src/server/auth/ip-cliente';

// Spec: access-throttling, "Trusted Client IP Resolution". These are the
// RED threat-matrix tests for the X-Forwarded-For trust boundary (design
// "Threat matrix"): the hop count is configuration, only the rightmost
// `hops` entry is ever read, and an unresolvable value fails closed into
// ONE shared bucket -- never "no counter".

function fakeReq(headers: Record<string, string | undefined>, remoteAddress?: string): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

describe('resolveClientIp', () => {
  it('resolves the hop exactly `hops` positions from the right', () => {
    const req = fakeReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' });
    expect(resolveClientIp(req, 1)).toBe('3.3.3.3');
    expect(resolveClientIp(req, 2)).toBe('2.2.2.2');
    expect(resolveClientIp(req, 3)).toBe('1.1.1.1');
  });

  it('falls back to req.socket.remoteAddress when the header is absent', () => {
    const req = fakeReq({}, '9.9.9.9');
    expect(resolveClientIp(req, 1)).toBe('9.9.9.9');
  });

  it('normalises an ::ffff:-mapped IPv4 address on an X-Forwarded-For hop', () => {
    const req = fakeReq({ 'x-forwarded-for': '::ffff:192.0.2.10' });
    expect(resolveClientIp(req, 1)).toBe('192.0.2.10');
  });

  it('normalises an ::ffff:-mapped IPv4 address on the socket fallback', () => {
    const req = fakeReq({}, '::ffff:192.0.2.20');
    expect(resolveClientIp(req, 1)).toBe('192.0.2.20');
  });

  it('fails closed to IP_DESCONOCIDA when hops exceeds the hop list length', () => {
    const req = fakeReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });
    expect(resolveClientIp(req, 5)).toBe(IP_DESCONOCIDA);
  });

  it('ignores a spoofed leftmost entry and still resolves the trusted rightmost hop', () => {
    // The leftmost entry is caller-supplied and un-trustable: a client can
    // send any garbage there. Only the edge-observed rightmost hop counts.
    const req = fakeReq({ 'x-forwarded-for': '999.999.999.999 (attacker-supplied), 5.5.5.5' });
    expect(resolveClientIp(req, 1)).toBe('5.5.5.5');
  });

  it('fails closed to IP_DESCONOCIDA when neither the header nor the socket address resolve', () => {
    const req = fakeReq({}, undefined);
    expect(resolveClientIp(req, 1)).toBe(IP_DESCONOCIDA);
  });
});
