import { Kysely, PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import type { DB } from './schema.js';

/**
 * Wraps the existing `pg.Pool` (`createPool()`, `src/server/db/pool.ts`) in
 * a typed `Kysely<DB>` (design decision D2-F). Kysely never creates its own
 * pool: one source of connection configuration, one teardown (`db.destroy()`
 * closes the `PostgresDialect`'s pool, which is the same pool the caller
 * passed in and owns).
 */
export function createDb(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
