import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveStaticPath } from '../../src/server/http/static';

const buildRoot = resolve('dist', 'client');

describe('resolveStaticPath', () => {
  it('resolves a normal asset path inside the build root', () => {
    const result = resolveStaticPath(buildRoot, '/assets/app-abc123.js');
    expect(result).toBe(join(buildRoot, 'assets', 'app-abc123.js'));
  });

  it('resolves the root path itself to the build root', () => {
    expect(resolveStaticPath(buildRoot, '/')).toBe(buildRoot);
  });

  it('rejects a literal .. traversal attempt', () => {
    expect(resolveStaticPath(buildRoot, '/../../etc/passwd')).toBeNull();
  });

  it('rejects a percent-encoded traversal attempt', () => {
    expect(resolveStaticPath(buildRoot, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('rejects a traversal attempt nested past a valid-looking prefix', () => {
    expect(resolveStaticPath(buildRoot, '/assets/../../secrets.env')).toBeNull();
  });

  it('never returns a path outside the build root even when it returns non-null', () => {
    const result = resolveStaticPath(buildRoot, '/assets/nested/dir/app.css');
    expect(result).not.toBeNull();
    expect(result!.startsWith(buildRoot)).toBe(true);
  });
});
