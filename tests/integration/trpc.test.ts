import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Kysely } from 'kysely';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createServer } from '../../src/server/index';
import { createDb } from '../../src/server/db/kysely';
import { createPool } from '../../src/server/db/pool';
import { loadDotEnv } from '../../src/server/config/env';
import type { DB } from '../../src/server/db/schema';
import type { AppRouter } from '../../src/server/trpc/app-router';

const APP_ORIGIN = 'http://127.0.0.1:3000';

// Real server, real socket, real tRPC handler (design: End-to-End Typed
// tRPC, Origin Validation on Mutations). No mocked transport — the SPA-side
// client talks the real `@trpc/client` batch protocol over a real HTTP
// connection, exactly as the browser would.
describe('tRPC transport (spec: End-to-End Typed tRPC)', () => {
  let server: Server;
  let baseUrl: string;
  let db: Kysely<DB>;

  beforeAll(async () => {
    loadDotEnv();
    db = createDb(createPool(process.env.TEST_DATABASE_URL));

    const buildRoot = mkdtempSync(path.join(tmpdir(), 'app-skeleton-trpc-'));
    writeFileSync(path.join(buildRoot, 'index.html'), '<!doctype html><html><body>SPA entry</body></html>');
    server = createServer({ appOrigin: APP_ORIGIN, buildRoot, db, hops: 1 });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await db.destroy();
  });

  it('the SPA-side typed client calls a real procedure and its response type is server-inferred', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${baseUrl}/trpc`, headers: { Origin: APP_ORIGIN } })],
    });
    const result = await client.ping.query();
    // `result.ok`/`result.servedAt` compile only because TypeScript infers
    // the response shape from `AppRouter` (imported as a type only) — there
    // is no hand-written duplicate interface anywhere in this test file.
    expect(result.ok).toBe(true);
    expect(typeof result.servedAt).toBe('string');
  });

  // Item #1 defines no domain mutation (spec: Origin Validation on
  // Mutations), so this throwaway procedure exists only to prove the guard
  // already wired at the HTTP layer (2.4, Phase 4) extends to a real tRPC
  // mutation without any per-procedure opt-in (design D-A).
  it('a matching Origin is accepted on the throwaway mutation', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${baseUrl}/trpc`, headers: { Origin: APP_ORIGIN } })],
    });
    const before = await client.throwawayMutationCount.query();
    const result = await client.throwawayMutation.mutate({});
    expect(result.count).toBe(before.count + 1);
  });

  it('a foreign Origin is rejected before the mutation runs — the counter does not move', async () => {
    const countBefore = await fetch(`${baseUrl}/trpc/throwawayMutationCount`, { headers: { Origin: APP_ORIGIN } })
      .then((res) => res.json())
      .then((body: { result: { data: { count: number } } }) => body.result.data.count);

    const res = await fetch(`${baseUrl}/trpc/throwawayMutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);

    const countAfter = await fetch(`${baseUrl}/trpc/throwawayMutationCount`, { headers: { Origin: APP_ORIGIN } })
      .then((r) => r.json())
      .then((body: { result: { data: { count: number } } }) => body.result.data.count);
    expect(countAfter).toBe(countBefore);
  });

  it('an absent Origin on a state-changing request is rejected — the counter does not move', async () => {
    const countBefore = await fetch(`${baseUrl}/trpc/throwawayMutationCount`, { headers: { Origin: APP_ORIGIN } })
      .then((res) => res.json())
      .then((body: { result: { data: { count: number } } }) => body.result.data.count);

    const res = await fetch(`${baseUrl}/trpc/throwawayMutation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);

    const countAfter = await fetch(`${baseUrl}/trpc/throwawayMutationCount`, { headers: { Origin: APP_ORIGIN } })
      .then((r) => r.json())
      .then((body: { result: { data: { count: number } } }) => body.result.data.count);
    expect(countAfter).toBe(countBefore);
  });
});
