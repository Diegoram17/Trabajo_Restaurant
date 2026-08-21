import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Kysely } from 'kysely';
import { createServer } from '../../src/server/index';
import { createDb } from '../../src/server/db/kysely';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';
import type { DB } from '../../src/server/db/schema';

// Real server on an ephemeral port, real socket, against a synthetic fixture
// buildRoot (no real SPA build needed to prove the pipeline's ORDER —
// tests/integration/routes.test.ts separately proves the real build serves
// the 4 domain routes). Covers design decisions D-A (guard first), D-C (the
// SPA fallback needs Accept: text/html, never a blanket catch-all), and D-D
// (static path containment already unit-tested; this proves it's actually
// wired into the pipeline).
describe('HTTP pipeline (design: Runtime Shape)', () => {
  let server: Server;
  let baseUrl: string;
  let db: Kysely<DB>;

  beforeAll(async () => {
    loadDotEnv();
    db = createDb(createPool(process.env.TEST_DATABASE_URL));

    const buildRoot = mkdtempSync(path.join(tmpdir(), 'app-skeleton-pipeline-'));
    writeFileSync(path.join(buildRoot, 'index.html'), '<!doctype html><html><body>SPA entry</body></html>');
    mkdirSync(path.join(buildRoot, 'assets'));
    writeFileSync(path.join(buildRoot, 'assets', 'app.abc123.js'), 'export {};');

    server = createServer({ appOrigin: 'http://127.0.0.1:3000', buildRoot, db, hops: 1 });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.destroy();
  });

  it('an unknown path with Accept: text/html falls back to the SPA entry document', async () => {
    const res = await fetch(`${baseUrl}/some/unknown/path`, { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('SPA entry');
  });

  it('/trpc/nope returns JSON, never HTML', async () => {
    const res = await fetch(`${baseUrl}/trpc/nope`, { headers: { Accept: 'text/html' } });
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-type')).not.toContain('text/html');
    const body = await res.text();
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it('a missing hashed asset returns 404, not HTML', async () => {
    const res = await fetch(`${baseUrl}/assets/app.deadbeef.js`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toContain('text/html');
  });

  it('an existing static asset is served with 200', async () => {
    const res = await fetch(`${baseUrl}/assets/app.abc123.js`);
    expect(res.status).toBe(200);
  });
});
