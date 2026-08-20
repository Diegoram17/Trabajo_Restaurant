import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite builds only the SPA bundle; the Node server is a separate build
// output compiled by tsc (see tsconfig.server.json, design decision D-B).
// `root` is deliberately left at the project root instead of `src/client`:
// Vitest inherits Vite's `root` by default, and `tests/` lives at the
// project root, not under `src/client`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/client/index.html', import.meta.url)),
    },
  },
  test: {
    globals: true,
    pool: 'forks',
    // Integration tests share ONE scratch PostgreSQL database for the
    // whole run (global-setup.ts migrates it once, ADR-0038).
    // migrations.test.ts drops and re-applies the schema from a clean
    // slate to prove migration ordering; running test FILES in parallel
    // (Vitest's default) races that DROP/CREATE against any other file
    // reading the same tables/functions mid-flight (dia-operativo.test.ts,
    // vigencia.test.ts). Sequential file execution is the correctness
    // requirement of a single shared external fixture, not a performance
    // choice.
    fileParallelism: false,
    globalSetup: ['tests/setup/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
