/**
 * Reads process-level configuration the server needs before it can accept
 * any request. `loadEnv` throws instead of falling back to a default: an
 * unset `APP_ORIGIN` would otherwise silently disable the Origin guard
 * (design `origin-guard.ts`, ADR-0033 §3) rather than fail loudly at boot.
 */

export interface EnvConfig {
  appOrigin: string;
  /** Position, from the right, of the trusted-edge hop in `X-Forwarded-For`
   *  (design "Trusted Client IP Resolution", `src/server/auth/ip-cliente.ts`). */
  trustedProxyHops: number;
}

const TRUSTED_PROXY_HOPS_POR_DEFECTO = 1;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): EnvConfig {
  const appOrigin = source.APP_ORIGIN;
  if (!appOrigin) {
    throw new Error(
      'APP_ORIGIN environment variable is required and has no default. Set it to the exact scheme+host+port the server is served from.',
    );
  }

  const trustedProxyHopsRaw = source.TRUSTED_PROXY_HOPS;
  let trustedProxyHops = TRUSTED_PROXY_HOPS_POR_DEFECTO;
  if (trustedProxyHopsRaw !== undefined && trustedProxyHopsRaw !== '') {
    if (!/^\d+$/.test(trustedProxyHopsRaw)) {
      throw new Error('TRUSTED_PROXY_HOPS must be a non-negative integer when set.');
    }
    trustedProxyHops = Number(trustedProxyHopsRaw);
  }

  return { appOrigin, trustedProxyHops };
}

/**
 * Loads `.env` into `process.env` for a standalone Node entry point
 * (`npm run migrate`, `tests/setup/global-setup.ts`). Uses Node's native
 * `--env-file`-equivalent API rather than a `dotenv` dependency. Safe to
 * call more than once in the same process: `loadEnvFile` never overwrites a
 * variable that is already set, so an explicit override (e.g. the
 * `DATABASE_URL` global-setup injects for its `npm run migrate` subprocess)
 * always wins over `.env`. A missing `.env` file is not an error here —
 * `loadEnv`/`createPool` throw their own specific, actionable error when a
 * required variable is still absent afterward.
 */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile?.();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw error;
    }
  }
}
