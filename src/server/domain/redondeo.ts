/**
 * THE system's single monetary rounding point (ADR-0032, ADR-0039, design
 * D2-C/D2-D). Two composable families sit on top of `redondear`:
 * `reparto` when there is a total to respect, `porcentaje` when there is
 * none. Nothing under `src/server/**` may round money any other way
 * (`tests/unit/sin-redondeo-suelto.test.ts` enforces that structurally).
 */

/** Integer amount in the minor unit (ADR-0011): a whole number of cents. */
export type Centimos = number;

/** Integer percentage in basis points (ADR-0039): 18% is written `1800`. */
export type PuntosBasicos = number;

/**
 * Rounds the exact rational `numerador / denominador` to the nearest
 * integer, half up, symmetric around zero (D2-D): `redondear(-n, d) ===
 * -redondear(n, d)`. Taking bigint instead of an already-divided `number`
 * keeps the division INSIDE this single rounding point — a caller that
 * tries to hand in a float never even reaches it, because converting a
 * fractional value with `BigInt(...)` throws at that boundary.
 *
 * Throws if the rounded result is not a safe integer.
 */
export function redondear(numerador: bigint, denominador: bigint): Centimos {
  const negativo = numerador < 0n;
  const magnitud = negativo ? -numerador : numerador;
  const cociente = magnitud / denominador;
  const resto = magnitud % denominador;
  const redondeadoAbs = resto * 2n >= denominador ? cociente + 1n : cociente;
  const redondeado = negativo ? -redondeadoAbs : redondeadoAbs;

  const resultado = Number(redondeado);
  if (!Number.isSafeInteger(resultado)) {
    throw new Error(
      `redondear: the result ${redondeado} is not a safe integer number of cents`,
    );
  }
  return resultado;
}

/**
 * Family B (no total to respect, TECH-DESIGN "Porcentaje"): applies
 * `puntos` basis points to `base`. The division by 10 000 happens INSIDE
 * `redondear` — there is no second rounding point anywhere. Every
 * higher-level total MUST be a sum of already-rounded results of this
 * function, never a fresh call over an aggregated base (money-rounding
 * spec, "Percentage does not repeat rounding over an aggregate").
 */
export function porcentaje(base: Centimos, puntos: PuntosBasicos): Centimos {
  return redondear(BigInt(base) * BigInt(puntos), 10_000n);
}

/** One input part of a `reparto`: `peso` is a plain relative weight, NOT money. */
export interface ParteReparto<T> {
  readonly clave: T;
  readonly peso: number;
}

/** A `ParteReparto` after `reparto` has assigned its share of the total. */
export interface ParteRepartida<T> extends ParteReparto<T> {
  readonly monto: Centimos;
}

/**
 * Verifies `ordenResiduo` defines a total order over `partes`: comparing
 * any two distinct parts must never return 0. A silent tie would move a
 * cent to whichever part happens to sort first, with nothing raising a
 * flag (D2-E) — so this checks every pair up front, not only the ones the
 * remainder-assignment step happens to compare.
 */
function verificarOrdenTotal<T>(
  partes: readonly ParteRepartida<T>[],
  ordenResiduo: (a: ParteRepartida<T>, b: ParteRepartida<T>) => number,
): void {
  for (const [indice, a] of partes.entries()) {
    for (const b of partes.slice(indice + 1)) {
      if (ordenResiduo(a, b) === 0) {
        throw new Error(
          'reparto: ordenResiduo must define a total order — it returned 0 for two distinct parts',
        );
      }
    }
  }
}

/**
 * Family A (there is a total to respect, TECH-DESIGN "Reparto"): truncates
 * every part's proportional share and hands out the remainder one cent at
 * a time, in the order `ordenResiduo` defines. `Σ monto === total`, by
 * construction. `ordenResiduo` is required and has no default — ADR-0032's
 * three distribution orders disagree with each other, and a default would
 * be a fourth order nobody chose (D2-E). Returns the parts in input order;
 * `ordenResiduo` only decides who receives the extra cent.
 */
export function reparto<T>(
  total: Centimos,
  partes: readonly ParteReparto<T>[],
  opciones: { ordenResiduo: (a: ParteRepartida<T>, b: ParteRepartida<T>) => number },
): ParteRepartida<T>[] {
  if (partes.length === 0) {
    throw new Error('reparto: requires at least one part');
  }
  if (total < 0) {
    throw new Error('reparto: total must not be negative');
  }

  const totalBig = BigInt(total);
  const partesConPeso = partes.map((parte) => ({ parte, peso: BigInt(parte.peso) }));
  const sumaPesos = partesConPeso.reduce((suma, item) => suma + item.peso, 0n);
  if (sumaPesos <= 0n) {
    throw new Error('reparto: the sum of weights must be positive');
  }

  const partesConMonto: ParteRepartida<T>[] = partesConPeso.map(({ parte, peso }) => ({
    ...parte,
    monto: Number((totalBig * peso) / sumaPesos),
  }));

  const sumaTruncada = partesConMonto.reduce((suma, parte) => suma + BigInt(parte.monto), 0n);
  const residuo = Number(totalBig - sumaTruncada);

  if (residuo === 0) {
    return partesConMonto;
  }

  verificarOrdenTotal(partesConMonto, opciones.ordenResiduo);
  const beneficiarios = new Set([...partesConMonto].sort(opciones.ordenResiduo).slice(0, residuo));

  return partesConMonto.map((parte) =>
    beneficiarios.has(parte) ? { ...parte, monto: parte.monto + 1 } : parte,
  );
}
