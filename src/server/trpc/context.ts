import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * No domain context yet — the data-access layer (design D-E) is
 * deliberately deferred past item #1, so this creates nothing that touches
 * PostgreSQL. The `Origin` guard already runs before this handler is
 * reached (`src/server/index.ts`, pipeline step 1); this context does not
 * duplicate that check.
 */
export function createContext(_opts: { req: IncomingMessage; res: ServerResponse }): Record<string, never> {
  return {};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
