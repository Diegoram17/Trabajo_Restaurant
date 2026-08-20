import { execSync } from 'node:child_process';
import { loadDotEnv } from '../../src/server/config/env';

/**
 * Vitest globalSetup (ADR-0038): migrates a scratch PostgreSQL database once,
 * before the whole test run, so integration tests exercise real concurrency
 * and row-locking behaviour (`SELECT ... FOR UPDATE`, ADR-0003) that no mock
 * or in-memory substitute can exhibit.
 *
 * `TEST_DATABASE_URL` MUST point at a scratch database dedicated to the test
 * run, never at a developer's own data — migrations are forward-only
 * (ADR-0022) and this suite may run them repeatedly.
 *
 * `scripts/migrate.ts` (this change's Phase 2/3) is invoked as a subprocess,
 * the same way `npm run migrate` does, so this file stays decoupled from its
 * internal shape and only relies on its CLI contract: read `DATABASE_URL`
 * from the environment, apply pending migrations, exit.
 *
 * Wired here, unexercised until PostgreSQL is reachable and the runner
 * exists (later work units in this same change).
 */
export default async function setup(): Promise<void> {
  // Nothing loads `.env` before this point (Phase 1/2 never needed a real
  // connection string); load it here so `TEST_DATABASE_URL` is visible
  // without hardcoding a path or adding a `dotenv` dependency.
  loadDotEnv();

  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Point it at a scratch PostgreSQL database before running the suite.',
    );
  }

  execSync('npm run migrate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: connectionString },
  });
}
