import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnv } from '../../src/server/config/env';

/**
 * P2 (design.md): generated types cannot go stale. Regenerates the schema
 * into a TEMPORARY file from `TEST_DATABASE_URL` (already migrated by
 * `tests/setup/global-setup.ts`) and compares it against the committed
 * `src/server/db/schema.d.ts`. Two traps this deliberately avoids:
 *
 * - It never sets `DATABASE_URL` and never writes into the source tree --
 *   either would make this gate green by construction, forever.
 * - It normalizes CRLF -> LF before comparing: on Windows with
 *   `core.autocrlf` the committed file round-trips through git as CRLF while
 *   the freshly generated one comes back from kysely-codegen as LF, and a
 *   false red would teach people to ignore the gate.
 */
describe('generated types match the migrated schema (design P2)', () => {
  const committedPath = fileURLToPath(new URL('../../src/server/db/schema.d.ts', import.meta.url));
  // Invoked as `node <bin.js>` rather than through `npx`/the shell: on
  // Windows, spawning a `.cmd` shim via execFileSync needs `shell: true`,
  // which then requires shell-escaping the arguments -- resolving the real
  // entry point sidesteps both cross-platform.
  const kyselyCodegenBin = fileURLToPath(
    new URL('../../node_modules/kysely-codegen/dist/cli/bin.js', import.meta.url),
  );
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('src/server/db/schema.d.ts is exactly what `npm run db:types` would generate right now', () => {
    loadDotEnv();
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is not set. Point it at a migrated scratch PostgreSQL database.');
    }

    tempDir = mkdtempSync(path.join(tmpdir(), 'schema-types-'));
    const tempFile = path.join(tempDir, 'schema.d.ts');

    execFileSync(process.execPath, [kyselyCodegenBin, '--dialect', 'postgres', '--out-file', tempFile], {
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: 'pipe',
    });

    const committed = readFileSync(committedPath, 'utf8').replace(/\r\n/g, '\n');
    const generated = readFileSync(tempFile, 'utf8').replace(/\r\n/g, '\n');

    expect(generated, 'src/server/db/schema.d.ts is stale -- run `npm run db:types` and commit the result').toBe(
      committed,
    );
  });
});
