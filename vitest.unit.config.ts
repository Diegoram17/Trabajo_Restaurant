import { defineConfig } from 'vitest/config';

// Separate config for the unit tier (Phase 2, work unit 2 of app-skeleton-base-schema).
//
// `vite.config.ts`'s `test` block wires a `globalSetup` that migrates a
// scratch PostgreSQL database (ADR-0038) before ANY test file runs, no
// matter which files are selected on the command line — `vitest run
// tests/unit` still triggers it. Unit-tier tests (env loader, origin guard,
// static path containment, migration ordering) are pure functions with no
// DB and no socket by design, so they need a config that never references
// that setup file. Integration tests keep using `vite.config.ts` /
// `npm test` once a real PostgreSQL instance is reachable (Phase 3+).
export default defineConfig({
  test: {
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
});
