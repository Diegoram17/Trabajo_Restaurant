import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Freezes the spec's One-Time Password Disclosure boundary
 * (specs/system-bootstrap, "Requirement: One-Time Password Disclosure"):
 * the seed's plaintext password leaves `scripts/seed.ts` through exactly
 * two doors — the return value of `seedArranque` (`ResultadoSeed.contrasena`)
 * and ONE console.log in the CLI entrypoint `main`. No console/logger call
 * OUTSIDE `main` may reference it, and `main` itself may print it exactly
 * once. Status messages and error handlers that never mention the password
 * are not the boundary and are not flagged.
 *
 * Same approach as sin-sql-interpolado.test.ts: the detector is validated
 * on inline fixtures first, so the real scan's clean result is backed by a
 * detector PROVEN to catch the violation.
 */

const RUTA_SEED = fileURLToPath(new URL('../../scripts/seed.ts', import.meta.url));

/** Span [start, end) of a top-level `async function <nombre>` (or
 *  `function <nombre>`), computed by brace matching from the first `{` after
 *  the signature. Template-literal `${}` interpolations are brace-balanced,
 *  so the walk terminates on the function's true closing brace. */
function cuerpoDe(source: string, nombre: string): { inicio: number; fin: number } | undefined {
  const declaracion = source.search(new RegExp(`(?:async\\s+)?function\\s+${nombre}\\s*\\(`));
  if (declaracion === -1) {
    return undefined;
  }
  const apertura = source.indexOf('{', declaracion);
  let profundidad = 0;
  for (let i = apertura; i < source.length; i++) {
    if (source[i] === '{') profundidad++;
    if (source[i] === '}') {
      profundidad--;
      if (profundidad === 0) {
        return { inicio: apertura, fin: i + 1 };
      }
    }
  }
  return undefined;
}

/** Every console.* call site with its full argument text: the span from the
 *  call's opening paren to its matching close, by paren matching. */
function llamadasConsole(source: string): { indice: number; argumentos: string }[] {
  const llamadas: { indice: number; argumentos: string }[] = [];
  for (const m of source.matchAll(/\bconsole\.\w+\s*\(/g)) {
    const apertura = (m.index ?? 0) + m[0].length - 1;
    let profundidad = 0;
    for (let i = apertura; i < source.length; i++) {
      if (source[i] === '(') profundidad++;
      if (source[i] === ')') {
        profundidad--;
        if (profundidad === 0) {
          llamadas.push({ indice: m.index ?? 0, argumentos: source.slice(apertura + 1, i) });
          break;
        }
      }
    }
  }
  return llamadas;
}

/**
 * The boundary verdict for a seed-script source: a console call carries the
 * password when its arguments mention any `contrasena` identifier. Exactly
 * one such call may exist, and it must live inside the CLI entrypoint `main`.
 */
function fronteraViolada(source: string): string | undefined {
  const main = cuerpoDe(source, 'main');
  if (main === undefined) {
    return 'the CLI entrypoint function `main` does not exist';
  }
  const queLaLlevan = llamadasConsole(source).filter((l) => /contrasena/i.test(l.argumentos));

  const fuera = queLaLlevan.find((l) => l.indice < main.inicio || l.indice >= main.fin);
  if (fuera !== undefined) {
    return 'a console call carrying the password exists OUTSIDE the CLI entrypoint `main`';
  }
  if (queLaLlevan.length === 0) {
    return 'no console call prints the password: the CLI entrypoint must print it exactly once';
  }
  if (queLaLlevan.length > 1) {
    return `expected exactly one password print (the documented one), found ${queLaLlevan.length}`;
  }
  return undefined;
}

// The detector is validated first, on inline fixtures, so the real scan's
// clean result below is backed by a detector PROVEN to catch a violation.
describe('fronteraViolada (detector validation)', () => {
  const fixtureLimpio = `
    export async function seedArranque(db) { return { contrasena: 'x', creado: true }; }
    async function main() {
      const r = await seedArranque(db);
      if (r.contrasena !== undefined) {
        console.log(\`Contraseña: \${r.contrasena}\`);
      } else {
        console.log('La base ya estaba sembrada.');
      }
    }
  `;

  it('accepts the single documented print plus password-free status output', () => {
    expect(fronteraViolada(fixtureLimpio)).toBeUndefined();
  });

  it('accepts an error handler that never mentions the password', () => {
    const conErrorHandler = `${fixtureLimpio}\n  main().catch((e) => { console.error(e); });`;
    expect(fronteraViolada(conErrorHandler)).toBeUndefined();
  });

  it('detects a console call carrying the password inside the seed function itself', () => {
    const violacion = `
      export async function seedArranque(db) { console.log('hash de', db.contrasena); }
      async function main() { console.log('listo'); }
    `;
    expect(fronteraViolada(violacion)).toContain('OUTSIDE');
  });

  it('detects a console call carrying the password outside any function (module scope)', () => {
    const violacion = `
      export async function seedArranque(db) { return { contrasena: 'x', creado: true }; }
      console.log('debug contrasena', resultado.contrasena);
      async function main() { console.log('listo'); }
    `;
    expect(fronteraViolada(violacion)).toContain('OUTSIDE');
  });

  it('detects a second password print even inside main', () => {
    const violacion = `
      async function main() {
        console.log(\`Contraseña: \${r.contrasena}\`);
        console.log('repetida:', r.contrasena);
      }
    `;
    expect(fronteraViolada(violacion)).toContain('exactly one');
  });

  it('detects a file whose password print vanished entirely', () => {
    const violacion = `
      export async function seedArranque(db) { return { contrasena: 'x', creado: true }; }
      async function main() { console.log('listo'); }
    `;
    expect(fronteraViolada(violacion)).toContain('no console call');
  });

  it('detects the absence of the CLI entrypoint', () => {
    expect(fronteraViolada('export const x = 1;')).toContain('`main`');
  });
});

describe('scripts/seed.ts carries the plaintext only through the return value and one print', () => {
  it('prints the password exactly once, in main, and nothing else carries it', () => {
    expect(fronteraViolada(readFileSync(RUTA_SEED, 'utf8'))).toBeUndefined();
  });
});
