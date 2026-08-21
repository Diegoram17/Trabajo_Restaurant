import { execSync } from 'node:child_process';
import { loadDotEnv } from '../../src/server/config/env';
import { createPool } from '../../src/server/db/pool';
import { createDb } from '../../src/server/db/kysely';
import { seedArranque } from '../../scripts/seed';

/**
 * Vitest globalSetup (ADR-0038): migrates AND seeds a scratch PostgreSQL
 * database once, before the whole test run, so integration tests exercise
 * real concurrency and row-locking behaviour (`SELECT ... FOR UPDATE`,
 * ADR-0003) that no mock or in-memory substitute can exhibit, and start
 * from the operable state `npm run migrate && npm run db:seed` produces
 * (BACKLOG #3, spec: system-bootstrap).
 *
 * `TEST_DATABASE_URL` MUST point at a scratch database dedicated to the test
 * run, never at a developer's own data — migrations are forward-only
 * (ADR-0022) and this suite may run them repeatedly.
 *
 * `scripts/migrate.ts` is invoked as a subprocess, the same way
 * `npm run migrate` does, so this file stays decoupled from its internal
 * shape. The seed, by contrast, is called DIRECTLY: `seedArranque` returns
 * the plaintext password to this caller (design "Seed"), so the fixture
 * admin is created without ever going through the CLI's print path — the
 * boundary tests/unit/sin-contrasena-en-logs.test.ts freezes.
 *
 * The captured plaintext is exposed to the forked test files through
 * `process.env.ADMIN_CONTRASENA_SEED`: the forks are spawned after this
 * setup runs and inherit the main process's environment. A second run
 * against an already-seeded database is a no-op, and the variable is left
 * unset in that case — later phases' login tests must not rely on it.
 */
export default async function setup(): Promise<void> {
  // Nothing loads `.env` before this point; load it here so
  // `TEST_DATABASE_URL` is visible without a `dotenv` dependency.
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

  const pool = createPool(connectionString);
  try {
    const db = createDb(pool);
    const resultado = await seedArranque(db);
    if (resultado.contrasena !== undefined) {
      process.env.ADMIN_CONTRASENA_SEED = resultado.contrasena;
    }
  } finally {
    await pool.end();
  }
}
