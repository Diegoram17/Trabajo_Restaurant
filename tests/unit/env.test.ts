import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/server/config/env';

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

  it('returns the configured origin when APP_ORIGIN is set', () => {
    const env = loadEnv({ APP_ORIGIN: 'https://trabajo-restaurant.example' });
    expect(env).toEqual({ appOrigin: 'https://trabajo-restaurant.example' });
  });
});
