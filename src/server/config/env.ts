/**
 * Reads process-level configuration the server needs before it can accept
 * any request. `loadEnv` throws instead of falling back to a default: an
 * unset `APP_ORIGIN` would otherwise silently disable the Origin guard
 * (design `origin-guard.ts`, ADR-0033 §3) rather than fail loudly at boot.
 */

export interface EnvConfig {
  appOrigin: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): EnvConfig {
  const appOrigin = source.APP_ORIGIN;
  if (!appOrigin) {
    throw new Error(
      'APP_ORIGIN environment variable is required and has no default. Set it to the exact scheme+host+port the server is served from.',
    );
  }
  return { appOrigin };
}
