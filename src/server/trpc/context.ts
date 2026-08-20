import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema.js';

/**
 * The tRPC context (design D2-G). Carries a data-access **handle**, never
 * data: there is no per-request and no per-process memo of a query result.
 * Caching a configuration row here would be a second source of truth that
 * desynchronizes the moment a new effective row is written (ADR-0013). The
 * `Origin` guard already runs before this handler is reached
 * (`src/server/index.ts`, pipeline step 1); this context does not duplicate
 * that check.
 */
export interface Context {
  readonly db: Kysely<DB>;
}

/**
 * Binds one `Kysely<DB>` to every request's context. `db` is required, not
 * optional (D2-G): an optional handle would let a procedure be written
 * against a database that may not be there, and from this item onward the
 * process means nothing without one.
 */
export function createContextFactory(
  db: Kysely<DB>,
): (opts: { req: IncomingMessage; res: ServerResponse }) => Context {
  return () => ({ db });
}
