import { describe, expect, it } from 'vitest';
import { checkOrigin } from '../../src/server/http/origin-guard';

const APP_ORIGIN = 'https://trabajo-restaurant.example';

describe('checkOrigin', () => {
  it('allows a state-changing request whose Origin matches exactly', () => {
    expect(checkOrigin('POST', APP_ORIGIN, APP_ORIGIN)).toEqual({ allowed: true });
  });

  it('rejects a state-changing request from a foreign Origin', () => {
    const result = checkOrigin('POST', 'https://evil.example', APP_ORIGIN);
    expect(result).toEqual({ allowed: false, status: 403 });
  });

  it('rejects a state-changing request with no Origin header at all', () => {
    const result = checkOrigin('POST', undefined, APP_ORIGIN);
    expect(result).toEqual({ allowed: false, status: 403 });
  });

  it('rejects a suffix-lookalike Origin instead of matching by substring', () => {
    // A naive `.endsWith()`/`.includes()` check would let this through.
    const lookalike = `https://evil-${APP_ORIGIN.replace('https://', '')}`;
    const result = checkOrigin('POST', lookalike, APP_ORIGIN);
    expect(result).toEqual({ allowed: false, status: 403 });
  });

  it.each(['PUT', 'PATCH', 'DELETE'] as const)(
    'applies the same rule to the %s method',
    (method) => {
      const result = checkOrigin(method, 'https://evil.example', APP_ORIGIN);
      expect(result.allowed).toBe(false);
    },
  );

  it('does not gate a GET request even with a foreign or absent Origin', () => {
    expect(checkOrigin('GET', 'https://evil.example', APP_ORIGIN)).toEqual({ allowed: true });
    expect(checkOrigin('GET', undefined, APP_ORIGIN)).toEqual({ allowed: true });
  });

  it('rejects with no body detail beyond the allowed/status shape', () => {
    const result = checkOrigin('POST', 'https://evil.example', APP_ORIGIN);
    expect(Object.keys(result).sort()).toEqual(['allowed', 'status']);
  });
});
