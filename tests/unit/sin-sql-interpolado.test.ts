import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Freezes the data-access spec's "no money-writing path bypasses the bound
 * parameter" requirement (ADR-0042, ADR-0039): every INSERT/UPDATE of a
 * money or percentage column MUST travel through a bound driver parameter,
 * never a value interpolated straight into the SQL text. Kysely's own `sql`
 * tagged template (used throughout src/server/domain/vigencias.ts) binds
 * every `${}` as a parameter by construction -- it is NOT a violation and
 * must never be flagged. This scans every `.ts` file under `src/server/**`
 * for the two realistic ways someone could reintroduce an unbound value:
 * Kysely's own documented `sql.raw()` escape hatch used with an
 * interpolated template literal (see Kysely's own warning example:
 * `sql\`... ${sql.raw(firstName)}\``), and a raw `pg` driver call
 * (`pool.query(...)`/`client.query(...)`, the layer Kysely wraps per design
 * D2-F) built from an untagged template literal or string concatenation
 * instead of a `$1`-style bound parameter.
 */

const SRC_SERVER_ROOT = resolve('src', 'server');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const PATRONES_PROHIBIDOS = [
  // Kysely's sql.raw() inserts its argument as literal, UNPARAMETERIZED SQL
  // text -- unlike the sql`` tagged template, it does not bind `${}`
  // expressions as parameters. A template literal passed to sql.raw() that
  // still interpolates a JS expression defeats that guarantee.
  /\bsql\.raw\s*\(\s*`[^`]*\$\{/,
  // A raw pg driver call whose SQL text is an untagged template literal
  // that interpolates a JS expression directly into the query text,
  // instead of leaving the value to travel as a bound parameter ($1-style
  // placeholder in a second argument array).
  /\b(?:pool|client)\.query\s*\(\s*`[^`]*\$\{/,
  // Same raw driver call, but the SQL text is built by string
  // concatenation (+) instead of a bound parameter.
  /\b(?:pool|client)\.query\s*\([^)]*['"`]\s*\+/,
];

function contieneSqlInterpolado(sourceText: string): boolean {
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
// empty result below is backed by a scanner PROVEN to catch a violation --
// not vacuously true because nothing was ever checked.
describe('contieneSqlInterpolado', () => {
  it('detects sql.raw() with an interpolated template literal', () => {
    expect(
      contieneSqlInterpolado('sql.raw(`UPDATE configuracion_costos SET salario_cocina = ${salario}`);'),
    ).toBe(true);
  });

  it('detects pool.query() with an interpolated template literal', () => {
    expect(
      contieneSqlInterpolado(
        'pool.query(`INSERT INTO configuracion_costos (salario_cocina) VALUES (${salario})`);',
      ),
    ).toBe(true);
  });

  it('detects client.query() built by string concatenation', () => {
    expect(
      contieneSqlInterpolado("client.query('UPDATE configuracion_costos SET salario_cocina = ' + salario);"),
    ).toBe(true);
  });

  it('ignores a mention of the banned names inside a comment', () => {
    expect(contieneSqlInterpolado('// pool.query(`... ${x}`) is banned here')).toBe(false);
  });

  it("does not flag Kysely's own sql tagged template, which binds \\${} as a parameter", () => {
    expect(
      contieneSqlInterpolado('sql<boolean>`dia_operativo(vigente_desde) <= dia_operativo(${instante})`;'),
    ).toBe(false);
  });

  it('does not flag a parameterized raw query using a $1-style placeholder', () => {
    expect(
      contieneSqlInterpolado(
        "client.query('UPDATE configuracion_costos SET salario_cocina = $1 WHERE id = $2', [salario, id]);",
      ),
    ).toBe(false);
  });

  it("does not flag Kysely's fluent .values() builder", () => {
    expect(
      contieneSqlInterpolado("db.insertInto('configuracion_costos').values({ salario_cocina: salario }).execute();"),
    ).toBe(false);
  });
});

describe('no interpolated SQL under src/server', () => {
  it('contains zero occurrences of sql.raw()/pool.query()/client.query() built with an interpolated value', () => {
    const ofensores = listarArchivosTs(SRC_SERVER_ROOT).filter((archivo) =>
      contieneSqlInterpolado(readFileSync(archivo, 'utf8')),
    );
    expect(ofensores).toEqual([]);
  });
});
