/**
 * Origin guard (design D-A, ADR-0033 §3): a single chokepoint checked at
 * the HTTP layer, before body parsing and before any tRPC procedure runs.
 * A tRPC-level opt-in middleware would be forgotten by the next procedure
 * — the project's dominant failure mode — so this predicate is meant to be
 * called once, unconditionally, in `src/server/index.ts`'s pipeline
 * (Phase 4), not per-procedure.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface OriginGuardResult {
  allowed: boolean;
  status?: 403;
}

/**
 * Exact string equality against `appOrigin` — no wildcard, no suffix or
 * substring match (a suffix match would let `https://evil-<origin>`
 * through). Only state-changing HTTP methods are gated; GET is unaffected
 * (SSE, item #4, is a GET). A rejection carries no body detail: the caller
 * learns only that the request was refused, not why.
 */
export function checkOrigin(
  method: string,
  origin: string | undefined,
  appOrigin: string,
): OriginGuardResult {
  if (!STATE_CHANGING_METHODS.has(method.toUpperCase())) {
    return { allowed: true };
  }
  if (origin === appOrigin) {
    return { allowed: true };
  }
  return { allowed: false, status: 403 };
}
