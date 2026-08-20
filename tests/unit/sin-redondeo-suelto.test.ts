import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Freezes ADR-0032/ADR-0039: `redondear` (and the two families built on it,
 * `porcentaje`/`reparto`) is the ONLY monetary rounding point in the
 * system. This scans every `.ts` file under `src/server/**` for the three
 * ways someone could quietly reintroduce a second one: `Math.*`,
 * `.toFixed(`, `parseFloat(`.
 */

const SRC_SERVER_ROOT = resolve('src', 'server');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const PATRONES_PROHIBIDOS = [/\bMath\.\w+/, /\.toFixed\s*\(/, /\bparseFloat\s*\(/];

function contieneRedondeoSuelto(sourceText: string): boolean {
  const codigo = stripComments(sourceText);
  return PATRONES_PROHIBIDOS.some((patron) => patron.test(codigo));
}

function listarArchivosTs(dir: string): string[] {
  const entradas = readdirSync(dir, { withFileTypes: true });
  const archivos: string[] = [];
  for (const entrada of entradas) {
    const rutaCompleta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      archivos.push(...listarArchivosTs(rutaCompleta));
    } else if (entrada.isFile() && entrada.name.endsWith('.ts')) {
      archivos.push(rutaCompleta);
    }
  }
  return archivos;
}

// The detector is validated first, on inline fixtures, so the real scan's
// empty result below is backed by a scanner PROVEN to catch a violation —
// not vacuously true because nothing was ever checked.
describe('contieneRedondeoSuelto', () => {
  it('detects a direct Math.round call', () => {
    expect(contieneRedondeoSuelto('const x = Math.round(1.5);')).toBe(true);
  });

  it('detects .toFixed(', () => {
    expect(contieneRedondeoSuelto('value.toFixed(2)')).toBe(true);
  });

  it('detects parseFloat(', () => {
    expect(contieneRedondeoSuelto("parseFloat('1.5')")).toBe(true);
  });

  it('ignores a mention of the banned names inside a comment', () => {
    expect(contieneRedondeoSuelto('// Math.round and parseFloat are banned here')).toBe(false);
  });

  it('returns false for clean bigint arithmetic with no banned pattern', () => {
    expect(contieneRedondeoSuelto('const x = (a * b) / c;')).toBe(false);
  });
});

describe('no loose rounding under src/server', () => {
  it('contains zero occurrences of Math.*, .toFixed(, or parseFloat( in production code', () => {
    const ofensores = listarArchivosTs(SRC_SERVER_ROOT).filter((archivo) =>
      contieneRedondeoSuelto(readFileSync(archivo, 'utf8')),
    );
    expect(ofensores).toEqual([]);
  });
});
