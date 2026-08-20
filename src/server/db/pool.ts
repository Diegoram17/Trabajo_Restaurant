import { Pool } from 'pg';

/**
 * Creates a `pg` connection pool. Reads `DATABASE_URL` by default so the
 * server, `scripts/migrate.ts`, and any future domain code share one
 * configuration source; accepts an explicit override so integration tests
 * can point at `TEST_DATABASE_URL` without ever touching `DATABASE_URL`.
 * Throws instead of falling back to a default — an unset connection string
 * must fail loudly at boot, not silently connect to nothing (mirrors the
 * `APP_ORIGIN` check in `env.ts`).
 */
export function createPool(connectionString: string | undefined = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required and has no default. Set it to a reachable PostgreSQL connection string.',
    );
  }
  return new Pool({ connectionString });
}
