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
    globalSetup: ['tests/setup/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
