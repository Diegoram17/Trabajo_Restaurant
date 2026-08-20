import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite.config.ts` intentionally keeps `root` at the project root so
// Vitest's `tests/` discovery for the whole suite still works (Phase 1,
// work unit 1 decision — see that file's comment). Vite emits an HTML
// entry's output file at a path relative to `root`, so building with
// `root` at the project root while `index.html` lives under `src/client/`
// nests the emitted document at `dist/client/src/client/index.html`
// instead of `dist/client/index.html`, even though the JS/CSS chunks it
// references stay flat under `dist/client/assets/` (asset naming does not
// depend on `root`) — the reference breaks. A dedicated build-only config
// with `root: 'src/client'` (same separate-config pattern as
// `vitest.unit.config.ts`) resolves that without touching the shared
// Vitest config's root. Used by `npm run build` and by
// `tests/integration/routes.test.ts`'s real SPA build.
export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
