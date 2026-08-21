import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Kysely } from 'kysely';
import { resolverAcceso } from '../auth/acceso.js';
import type { DB } from '../db/schema.js';

/**
 * The tRPC context (design D2-G), re-exported from `auth/acceso.ts` where
 * it is produced: `resolverAcceso` is the single resolution path reused by
 * item #4's SSE `GET` (design D3-K), so the shape belongs where it is
 * built, not where it is first consumed. Carries request-scoped
 * authorization, re-resolved on every request and never memoized -- caching
 * a device/session row here would be a second source of truth that
 * desynchronizes the moment the underlying row changes (ADR-0013). The
 * `Origin` guard already runs before this handler is reached
 * (`src/server/index.ts`, pipeline step 1); this context does not duplicate
 * that check.
 */
export type { Context } from '../auth/acceso.js';

/**
 * Binds one `Kysely<DB>` and the configured `hops` to every request's
 * context. Now async: it delegates to `resolverAcceso`, which reads cookies
 * and verifies the device/session state against PostgreSQL before tRPC
 * dispatches to any procedure -- one insertion point, no per-procedure
 * opt-in (the `origin-guard.ts` lesson).
 */
export function createContextFactory(
  db: Kysely<DB>,
  hops: number,
): (opts: { req: IncomingMessage; res: ServerResponse }) => ReturnType<typeof resolverAcceso> {
  return ({ req, res }) => resolverAcceso(db, req, res, hops);
}
