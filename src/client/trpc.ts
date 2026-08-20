import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/trpc/app-router';

/**
 * The SPA's only tRPC client (ADR-0010: types come from the server, no code
 * generation). Same-origin relative URL — the same process serves this SPA
 * and the API it calls (design: Single-Origin Serving).
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc' })],
});
