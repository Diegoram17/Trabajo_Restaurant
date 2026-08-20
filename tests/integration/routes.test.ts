import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Kysely } from 'kysely';
import { createServer } from '../../src/server/index';
import { createDb } from '../../src/server/db/kysely';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';
import type { DB } from '../../src/server/db/schema';

const ROUTES = ['/estacion', '/kds', '/cocina', '/admin'] as const;

// Builds the REAL SPA (design D-B: Vite builds the client) and serves it
// through the same pipeline http-pipeline.test.ts exercises against a
// synthetic fixture. This is the genuine RED for 4.3/4.4: before
// `src/client/index.html` and its React entry exist, `vite build()` itself
// fails (no entry module to resolve) — not merely a generic "unknown path"
// pass-through the pipeline would already satisfy on its own.
describe('SPA route shells (ADR-0001: exactly /estacion, /kds, /cocina, /admin)', () => {
  let server: Server;
  let baseUrl: string;
  let db: Kysely<DB>;

  beforeAll(async () => {
    await build({ configFile: 'vite.build.config.ts', logLevel: 'warn' });

    loadDotEnv();
    db = createDb(createPool(process.env.TEST_DATABASE_URL));

    const buildRoot = fileURLToPath(new URL('../../dist/client', import.meta.url));
    server = createServer({ appOrigin: 'http://127.0.0.1:3000', buildRoot, db });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 60_000);

  afterAll(async () => {
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.destroy();
  });

  it.each(ROUTES)('%s returns the SPA entry document, 200', async (route) => {
    const res = await fetch(`${baseUrl}${route}`, { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('id="root"');
  });
});
