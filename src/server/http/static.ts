import { resolve, sep } from 'node:path';

/**
 * Static asset resolution (design D-D): the URL path is never trusted
 * directly. `requestPath` is decoded, then resolved against `buildRoot`,
 * and the result is only returned if it is still inside `buildRoot` — a
 * `..` segment (literal or percent-encoded) that would escape the build
 * output is rejected, not silently clamped.
 *
 * Returns the resolved absolute path, or `null` when `requestPath` would
 * escape `buildRoot`. Pure path math only — no filesystem access, so this
 * stays a unit test with no I/O.
 */
export function resolveStaticPath(buildRoot: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const root = resolve(buildRoot);
  const candidate = resolve(root, `.${decoded}`);

  if (candidate !== root && !candidate.startsWith(root + sep)) {
    return null;
  }
  return candidate;
}
