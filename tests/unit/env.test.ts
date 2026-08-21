import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/server/config/env';

const APP_ORIGIN = { APP_ORIGIN: 'https://trabajo-restaurant.example' };

describe('loadEnv', () => {
  it('throws when APP_ORIGIN is unset', () => {
    expect(() => loadEnv({})).toThrow();
  });

  it('throws when APP_ORIGIN is an empty string', () => {
    expect(() => loadEnv({ APP_ORIGIN: '' })).toThrow();
  });

  it('does not fall back to a default origin', () => {
    expect(() => loadEnv({ APP_ORIGIN: undefined })).toThrow(/APP_ORIGIN/);
  });

  it('returns the configured origin and the default trustedProxyHops when APP_ORIGIN is set', () => {
    const env = loadEnv(APP_ORIGIN);
    expect(env).toEqual({ appOrigin: 'https://trabajo-restaurant.example', trustedProxyHops: 1 });
  });

  it('TRUSTED_PROXY_HOPS defaults to 1 when unset', () => {
    const env = loadEnv({ ...APP_ORIGIN });
    expect(env.trustedProxyHops).toBe(1);
  });

  it('accepts an explicit non-negative integer TRUSTED_PROXY_HOPS', () => {
    expect(loadEnv({ ...APP_ORIGIN, TRUSTED_PROXY_HOPS: '2' }).trustedProxyHops).toBe(2);
    expect(loadEnv({ ...APP_ORIGIN, TRUSTED_PROXY_HOPS: '0' }).trustedProxyHops).toBe(0);
  });

  it('rejects a non-integer TRUSTED_PROXY_HOPS', () => {
    expect(() => loadEnv({ ...APP_ORIGIN, TRUSTED_PROXY_HOPS: 'abc' })).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => loadEnv({ ...APP_ORIGIN, TRUSTED_PROXY_HOPS: '1.5' })).toThrow(/TRUSTED_PROXY_HOPS/);
  });

  it('rejects a negative TRUSTED_PROXY_HOPS', () => {
    expect(() => loadEnv({ ...APP_ORIGIN, TRUSTED_PROXY_HOPS: '-1' })).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});
