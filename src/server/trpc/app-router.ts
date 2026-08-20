import { z } from 'zod';
import { publicProcedure, router } from './router.js';

/**
 * The one real procedure item #1 needs (spec: End-to-End Typed tRPC) — a
 * skeleton-level round trip, not a domain query. It reads and writes
 * nothing from PostgreSQL.
 */

/**
 * Module-scope counter for the throwaway mutation below (spec: Origin
 * Validation on Mutations). Item #1 defines no domain mutation, so this
 * exists only to prove the HTTP-layer `Origin` guard (2.4, wired in the
 * pipeline since Phase 4) already covers a real tRPC mutation with no
 * per-procedure opt-in — it holds no domain data and is never persisted.
 */
let throwawayMutationCount = 0;

export const appRouter = router({
  ping: publicProcedure.query(() => ({ ok: true as const, servedAt: new Date().toISOString() })),
  throwawayMutationCount: publicProcedure.query(() => ({ count: throwawayMutationCount })),
  throwawayMutation: publicProcedure.input(z.object({}).strict()).mutation(() => {
    throwawayMutationCount += 1;
    return { count: throwawayMutationCount };
  }),
});

export type AppRouter = typeof appRouter;
