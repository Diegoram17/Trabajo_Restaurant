/**
 * The whole deployable's HTTP entry point (design: Runtime Shape). One
 * ordered pipeline, in this exact order:
 *
 *   1. Origin guard (D-A, ADR-0033 §3) — an HTTP-layer chokepoint that no
 *      procedure added later can opt out of, unlike a per-procedure tRPC
 *      middleware.
 *   2. `/trpc/*`, the API namespace — the real tRPC router (Phase 5). An
 *      unknown procedure answers JSON, never HTML, so "the API namespace
 *      never falls through to the SPA document" invariant holds.
 *   3. Static SPA assets, path-containment enforced by `resolveStaticPath`
 *      (D-D).
 *   4. The SPA entry document — ONLY for requests that accept HTML (D-C): a
 *      blanket catch-all would answer a missing hashed asset with HTML
 *      instead of an honest 404.
 *   5. Otherwise, 404.
 */
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Kysely } from 'kysely';
import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';
import { checkOrigin } from './http/origin-guard.js';
import { resolveStaticPath } from './http/static.js';
import { loadDotEnv, loadEnv } from './config/env.js';
import { createDb } from './db/kysely.js';
import { createPool } from './db/pool.js';
import type { DB } from './db/schema.js';
import { appRouter } from './trpc/app-router.js';
import { createContextFactory } from './trpc/context.js';

/**
 * `db` is required, not optional (design D2-G): from item #2 onward the
 * process means nothing without a database, and an optional handle would
 * let a procedure be written against one that may not be there.
 */
export interface ServerConfig {
  appOrigin: string;
  buildRoot: string;
  db: Kysely<DB>;
}

/**
 * ADR-0041: bind to `127.0.0.1` only, never `0.0.0.0` — binding to all
 * interfaces would expose every access layer's credentials in cleartext on
 * whatever network the machine sits on. A single exported constant so
 * `main()` and its integration test share the exact same value instead of
 * two copies that could silently drift apart.
 */
export const DEFAULT_BIND_HOST = '127.0.0.1';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
}

function acceptsHtml(req: IncomingMessage): boolean {
  return (req.headers.accept ?? '').includes('text/html');
}

/**
 * design: "The No Cleartext Port" Integration Test, half 2 ("Rejected, not
 * redirected"). `X-Forwarded-Proto: http` is what the platform edge sets on
 * a request it received in cleartext (ADR-0037 §4) — this process legitimately
 * receives decrypted traffic *from* that edge, so this only fires when the
 * header explicitly says the ORIGINAL request was cleartext. A local-dev
 * request over plain loopback HTTP never carries this header at all (D3),
 * so it is unaffected.
 */
function isForwardedCleartext(req: IncomingMessage): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const value = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return value?.split(',')[0]?.trim().toLowerCase() === 'http';
}

async function tryServeStatic(buildRoot: string, requestPath: string, res: ServerResponse): Promise<boolean> {
  const resolved = resolveStaticPath(buildRoot, requestPath);
  if (!resolved) {
    return false;
  }
  try {
    const body = await readFile(resolved);
    res.writeHead(200, { 'Content-Type': contentTypeFor(resolved) });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function serveSpaEntry(buildRoot: string, res: ServerResponse): Promise<void> {
  const body = await readFile(join(buildRoot, 'index.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  appOrigin: string,
  buildRoot: string,
  createContext: ReturnType<typeof createContextFactory>,
): Promise<void> {
  if (isForwardedCleartext(req)) {
    res.writeHead(400);
    res.end();
    return;
  }

  const guard = checkOrigin(req.method ?? 'GET', req.headers.origin, appOrigin);
  if (!guard.allowed) {
    res.writeHead(guard.status ?? 403);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url ?? '/', 'http://internal');

  if (pathname === '/trpc' || pathname.startsWith('/trpc/')) {
    await nodeHTTPRequestHandler({
      router: appRouter,
      createContext,
      req,
      res,
      path: pathname.replace(/^\/trpc\/?/, ''),
    });
    return;
  }

  if (await tryServeStatic(buildRoot, pathname, res)) {
    return;
  }

  if (acceptsHtml(req)) {
    await serveSpaEntry(buildRoot, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

/**
 * Pure factory — no side effect until `.listen()` is called — so tests can
 * spin up a real server on an ephemeral port against a fixture `buildRoot`.
 */
export function createServer({ appOrigin, buildRoot, db }: ServerConfig): Server {
  const createContext = createContextFactory(db);
  return createHttpServer((req, res) => {
    handleRequest(req, res, appOrigin, buildRoot, createContext).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
  });
}

async function main(): Promise<void> {
  loadDotEnv();
  const { appOrigin } = loadEnv();
  const buildRoot = fileURLToPath(new URL('../../dist/client', import.meta.url));
  const port = Number(process.env.PORT ?? 3000);

  const db = createDb(createPool());
  const server = createServer({ appOrigin, buildRoot, db });
  server.listen(port, DEFAULT_BIND_HOST, () => {
    console.log(`Listening on http://${DEFAULT_BIND_HOST}:${port}`);
  });

  // Teardown: release the pool's connections on process shutdown, the same
  // way every test file destroys its own `db` in `afterAll` (D2-F).
  const shutdown = (): void => {
    server.close();
    db.destroy().catch((error: unknown) => console.error(error));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
