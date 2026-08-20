import { describe, expect, it } from 'vitest';
import { pendingMigrations } from '../../scripts/migrate';

describe('pendingMigrations', () => {
  it('sorts NNNN_name.sql files lexicographically before applying', () => {
    const files = ['0010_c.sql', '0001_a.sql', '0002_b.sql'];
    expect(pendingMigrations(files, [])).toEqual(['0001_a.sql', '0002_b.sql', '0010_c.sql']);
  });

  it('skips a filename already recorded as applied', () => {
    const files = ['0001_a.sql', '0002_b.sql', '0003_c.sql'];
    const applied = new Set(['0001_a.sql']);
    expect(pendingMigrations(files, applied)).toEqual(['0002_b.sql', '0003_c.sql']);
  });

  it('accepts a plain array of applied names, not only a Set', () => {
    const files = ['0001_a.sql', '0002_b.sql'];
    expect(pendingMigrations(files, ['0001_a.sql'])).toEqual(['0002_b.sql']);
  });

  it('returns an empty list when every file is already applied', () => {
    const files = ['0001_a.sql', '0002_b.sql'];
    expect(pendingMigrations(files, files)).toEqual([]);
  });

  it('is a no-op re-run: applying the pending list twice yields nothing the second time', () => {
    const files = ['0001_a.sql', '0002_b.sql'];
    const firstRun = pendingMigrations(files, []);
    const secondRun = pendingMigrations(files, firstRun);
    expect(secondRun).toEqual([]);
  });

  it('does not mutate the input files array', () => {
    const files = ['0002_b.sql', '0001_a.sql'];
    const snapshot = [...files];
    pendingMigrations(files, []);
    expect(files).toEqual(snapshot);
  });
});
