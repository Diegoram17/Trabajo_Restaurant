/**
 * The whole deployable's HTTP entry point (design: Runtime Shape). One
 * ordered pipeline, in this exact order:
 *
 *   1. Origin guard (D-A, ADR-0033 §3) — an HTTP-layer chokepoint that no
 *      procedure added later can opt out of, unlike a per-procedure tRPC
 *      middleware.
 *   2. `/trpc/*`, the API namespace — Phase 5 wires the real router here;
 *      until then every call answers JSON, never HTML, so the "the API
 *      namespace never falls through to the SPA document" invariant is
 *      provable now.
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
import { checkOrigin } from './http/origin-guard.js';
import { resolveStaticPath } from './http/static.js';
import { loadDotEnv, loadEnv } from './config/env.js';

export interface ServerConfig {
  appOrigin: string;
  buildRoot: string;
}

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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
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
): Promise<void> {
  const guard = checkOrigin(req.method ?? 'GET', req.headers.origin, appOrigin);
  if (!guard.allowed) {
    res.writeHead(guard.status ?? 403);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url ?? '/', 'http://internal');

  if (pathname === '/trpc' || pathname.startsWith('/trpc/')) {
    sendJson(res, 404, { error: 'NOT_FOUND' });
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
export function createServer({ appOrigin, buildRoot }: ServerConfig): Server {
  return createHttpServer((req, res) => {
    handleRequest(req, res, appOrigin, buildRoot).catch((error: unknown) => {
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

  const server = createServer({ appOrigin, buildRoot });
  // ADR-0041: bind to 127.0.0.1 only, never 0.0.0.0 — binding to all
  // interfaces would expose every access layer's credentials in cleartext
  // on whatever network the machine sits on.
  server.listen(port, '127.0.0.1', () => {
    console.log(`Listening on http://127.0.0.1:${port}`);
  });
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
