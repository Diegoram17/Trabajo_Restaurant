import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Kysely } from 'kysely';
import { createServer, DEFAULT_BIND_HOST } from '../../src/server/index';
import { createDb } from '../../src/server/db/kysely';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';
import type { DB } from '../../src/server/db/schema';

const APP_ORIGIN = 'http://127.0.0.1:3000';

function firstNonLoopbackIPv4(): string | undefined {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return undefined;
}

/**
 * design: "The 'No Cleartext Port' Integration Test".
 *
 * Provable from this repository (and proven below): the process binds
 * `127.0.0.1` only, never every interface; a request is rejected, never
 * redirected.
 *
 * NOT provable from this repository: the rejection of cleartext at the
 * PUBLIC origin — that boundary is the hosting platform's edge (ADR-0037
 * §4), which legitimately hands this process decrypted traffic inside the
 * perimeter. `X-Forwarded-Proto: http` is exactly what a misconfigured or
 * spoofed edge would forward; this repository's own remaining
 * responsibility is to refuse it outright rather than redirect (a redirect
 * would let the first cookie-bearing request travel in cleartext).
 */
describe('Transport (design: The "No Cleartext Port" Integration Test)', () => {
  let server: Server;
  let baseUrl: string;
  let port: number;
  let db: Kysely<DB>;

  beforeAll(async () => {
    loadDotEnv();
    db = createDb(createPool(process.env.TEST_DATABASE_URL));

    const buildRoot = mkdtempSync(path.join(tmpdir(), 'app-skeleton-transport-'));
    writeFileSync(path.join(buildRoot, 'index.html'), '<!doctype html><html><body>SPA entry</body></html>');
    server = createServer({ appOrigin: APP_ORIGIN, buildRoot, db, hops: 1 });
    await new Promise<void>((resolve) => server.listen(0, DEFAULT_BIND_HOST, () => resolve()));
    const address = server.address() as AddressInfo;
    port = address.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.destroy();
  });

  it('binds to the exact host main() uses to listen (ADR-0041): 127.0.0.1', () => {
    expect(DEFAULT_BIND_HOST).toBe('127.0.0.1');
    const address = server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });

  it('refuses a connection on a non-loopback local IPv4 address at the same port', async () => {
    const lanIp = firstNonLoopbackIPv4();
    if (!lanIp) {
      throw new Error('No non-loopback IPv4 interface available to prove the bind is loopback-only.');
    }
    await expect(
      new Promise<void>((resolve, reject) => {
        const socket = connect({ host: lanIp, port }, () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', reject);
      }),
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('rejects a request carrying X-Forwarded-Proto: http — 4xx, never a redirect', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { Accept: 'text/html', 'X-Forwarded-Proto': 'http' },
      redirect: 'manual',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not reject a plain request with no X-Forwarded-Proto header (local dev over loopback)', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(200);
  });
});
