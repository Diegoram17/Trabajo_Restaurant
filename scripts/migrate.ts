// Migration runner (design: plain numbered `.sql` files in `migrations/`,
// applied forward-only, ADR-0038).
//
// Phase 2 scope is ordering/skip logic ONLY, proven against a mocked file
// list and a mocked applied set — no filesystem read, no `pg` Pool, no
// transaction. Phase 3 (tasks 3.2/3.3) adds the `pg` Pool, per-file
// transactional execution, and `schema_migrations` bookkeeping, then wires
// this ordering into a real directory listing and a real applied-set query.
// This module has no top-level side effects, so importing it performs no
// I/O and needs no database.

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
