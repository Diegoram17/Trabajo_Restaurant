// Migration runner (design: plain numbered `.sql` files in `migrations/`,
// applied forward-only, ADR-0038).
//
// Phase 2 scope was ordering/skip logic ONLY, proven against a mocked file
// list and a mocked applied set. Phase 3 (this file) adds the real `pg`
// Pool, per-file transactional execution, and `schema_migrations`
// bookkeeping, wiring the Phase 2 ordering logic into a real directory
// listing and a real applied-set query.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { createPool } from '../src/server/db/pool';
import { loadDotEnv } from '../src/server/config/env';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Determines which migration files still need to run, in the order they
 * must be applied.
 *
 * - `files` is sorted lexicographically. The `NNNN_name.sql` naming
 *   convention (zero-padded, fixed width) keeps lexicographic order
 *   identical to numeric order.
 * - Any filename already present in `applied` is skipped, so re-running
 *   this against a fully-applied set is a no-op.
 */
export function pendingMigrations(
  files: readonly string[],
  applied: ReadonlySet<string> | readonly string[],
): string[] {
  const appliedNames = applied instanceof Set ? applied : new Set(applied);
  return [...files].sort().filter((file) => !appliedNames.has(file));
}

function migrationFilesOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql'));
}

async function ensureBookkeepingTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrationNames(client: PoolClient): Promise<Set<string>> {
  const { rows } = await client.query<{ nombre: string }>('SELECT nombre FROM schema_migrations');
  return new Set(rows.map((row) => row.nombre));
}

/**
 * Applies every pending migration found on disk, in lexicographic order,
 * each inside its own transaction. Returns the filenames actually applied —
 * an empty array means the database was already at the latest version, a
 * safe no-op.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await ensureBookkeepingTable(client);
    const applied = await appliedMigrationNames(client);
    const pending = pendingMigrations(migrationFilesOnDisk(), applied);

    for (const file of pending) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return pending;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const pool = createPool();
  try {
    const applied = await runMigrations(pool);
    console.log(
      applied.length > 0
        ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
        : 'No pending migrations.',
    );
  } finally {
    await pool.end();
  }
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
