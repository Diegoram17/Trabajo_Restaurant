import { describe, expect, it } from 'vitest';
import { porcentaje, redondear, reparto } from '../../src/server/domain/redondeo';
import type { Centimos, ParteReparto, PuntosBasicos } from '../../src/server/domain/redondeo';

// design D2-C/D2-D: `redondear` is THE system's single rounding point
// (ADR-0032). It takes an exact rational (numerador/denominador in bigint)
// and rounds it to the nearest integer, half up, symmetric around zero.
describe('redondear', () => {
  it('rounds a positive exact half up to the next integer', () => {
    expect(redondear(1n, 2n)).toBe(1); // 0.5 -> 1
  });

  it('rounds a positive value above half up, not down', () => {
    expect(redondear(3n, 2n)).toBe(2); // 1.5 -> 2
  });

  it('is symmetric around zero: redondear(-n, d) === -redondear(n, d)', () => {
    // D2-D rejects "half toward +Infinity" precisely because it breaks this
    // property: -0.5 must round to -1, not to 0.
    expect(redondear(-1n, 2n)).toBe(-1);
    expect(redondear(-3n, 2n)).toBe(-2);
    expect(redondear(-1n, 2n)).toBe(-redondear(1n, 2n));
    expect(redondear(-3n, 2n)).toBe(-redondear(3n, 2n));
  });

  it('truncates down when the fractional part is below half', () => {
    expect(redondear(4n, 10n)).toBe(0); // 0.4 -> 0
    expect(redondear(-4n, 10n)).toBe(0); // -0.4 -> 0 (still symmetric)
  });

  it('costs a sub-cent unit price without losing precision (TECH-DESIGN 788)', () => {
    // 180 g out of a 1200 g lot costed at S/ 50.00 (5000 centimos) costs
    // exactly 750 centimos. Rounding a per-unit cost first (5000/1200,
    // truncated to 4) and then multiplying by 180 would silently give 720 —
    // the numerator must be built as quantity * lot cost BEFORE the single
    // division, never as a persisted per-unit cost.
    expect(redondear(180n * 5000n, 1200n)).toBe(750);
  });

  it('returns a value at the exact Number.MAX_SAFE_INTEGER boundary without throwing', () => {
    expect(redondear(BigInt(Number.MAX_SAFE_INTEGER), 1n)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws when the rounded result exceeds Number.MAX_SAFE_INTEGER', () => {
    expect(() => redondear(BigInt(Number.MAX_SAFE_INTEGER) + 10n, 1n)).toThrow();
  });

  it('documents the boundary BigInt(1.5) throws — a float never reaches redondear', () => {
    // `redondear` takes bigint, not number, exactly so a fractional amount
    // cannot cross the boundary at all: converting it fails before the
    // function is even called.
    expect(() => BigInt(1.5)).toThrow();
  });
});

// design D2-C / money-rounding spec "Applying a percentage does not
// introduce a second rounding": `porcentaje` divides by 10 000 INSIDE
// `redondear`, its single application point.
describe('porcentaje', () => {
  it('applies a single rounding through redondear(base * puntos, 10000n)', () => {
    expect(porcentaje(100, 1800)).toBe(redondear(100n * 1800n, 10_000n));
    expect(porcentaje(100, 1800)).toBe(18); // 18% of 100 centimos
  });

  it('rounds a boundary base exactly at the half-cent mark up, symmetric for negatives', () => {
    expect(porcentaje(1, 5000)).toBe(1); // 1 * 0.5 = 0.5 -> 1
    expect(porcentaje(-1, 5000)).toBe(-1); // symmetric around zero
  });

  it('summing already-rounded rows is NOT the same as recalculating over the aggregate', () => {
    // money-rounding spec, "Percentage does not repeat rounding over an
    // aggregate": each row is rounded once, and a higher-level total MUST
    // be the sum of those rounded integers, never a fresh percentage
    // computed over the summed base. This test proves the two paths can
    // legitimately disagree, which is exactly why re-deriving over the
    // aggregate is forbidden.
    const bases: Centimos[] = [1, 1, 1];
    const puntos: PuntosBasicos = 1800; // 18%, e.g. IGV

    const sumaDeFilas = bases.reduce((acc, base) => acc + porcentaje(base, puntos), 0);
    const recalculoSobreAgregado = porcentaje(
      bases.reduce((acc, base) => acc + base, 0),
      puntos,
    );

    expect(sumaDeFilas).toBe(0); // each row: 0.18 -> rounds down to 0
    expect(recalculoSobreAgregado).toBe(1); // 3 * 0.18 = 0.54 -> rounds up to 1
    expect(sumaDeFilas).not.toBe(recalculoSobreAgregado);
  });
});

// design D2-E / money-rounding spec "Allocation respects the total, by
// construction": `reparto` truncates every part and hands the remainder out
// one cent at a time, in an order the CALLER injects — never a fixed order
// inside the primitive.
describe('reparto', () => {
  const descendentePesoAscendenteClave = (
    a: { clave: string; peso: number },
    b: { clave: string; peso: number },
  ): number => b.peso - a.peso || (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0);

  const ascendenteClaveNumerica = (a: { clave: number }, b: { clave: number }): number =>
    a.clave - b.clave;

  it('the sum of the allocated parts is exactly the total, for many random weights and totals', () => {
    // property test: no analytical formula computes "the right" per-part
    // amount here — the invariant that must hold for ANY input is that the
    // parts sum back to the total, with difference 0.
    for (let intento = 0; intento < 200; intento += 1) {
      const cantidadPartes = 1 + Math.floor(Math.random() * 8);
      const partes: ParteReparto<number>[] = Array.from({ length: cantidadPartes }, (_unused, indice) => ({
        clave: indice,
        peso: 1 + Math.floor(Math.random() * 100),
      }));
      const total = Math.floor(Math.random() * 10_000);

      const resultado = reparto(total, partes, { ordenResiduo: ascendenteClaveNumerica });
      const suma = resultado.reduce((acc, parte) => acc + parte.monto, 0);
      expect(suma).toBe(total);
    }
  });

  it('a zero remainder leaves every part exactly at its truncated share', () => {
    const partes: ParteReparto<string>[] = [
      { clave: 'a', peso: 1 },
      { clave: 'b', peso: 1 },
    ];
    const resultado = reparto(100, partes, { ordenResiduo: descendentePesoAscendenteClave });
    expect(resultado).toEqual([
      { clave: 'a', peso: 1, monto: 50 },
      { clave: 'b', peso: 1, monto: 50 },
    ]);
  });

  it('combo order (ADR-0029): remainder goes by descending list price, tie broken by ascending clave', () => {
    const partes: ParteReparto<string>[] = [
      { clave: 'b', peso: 50 },
      { clave: 'a', peso: 50 },
    ];
    const resultado = reparto(101, partes, { ordenResiduo: descendentePesoAscendenteClave });
    // both weights tie at 50: the ascending-clave tiebreak gives the cent to 'a'
    expect(resultado.find((parte) => parte.clave === 'a')?.monto).toBe(51);
    expect(resultado.find((parte) => parte.clave === 'b')?.monto).toBe(50);
    expect(resultado.reduce((acc, parte) => acc + parte.monto, 0)).toBe(101);
  });

  it('fixed-cost order: remainder goes by ascending clave (operational day) only', () => {
    const partes: ParteReparto<number>[] = [
      { clave: 3, peso: 1 },
      { clave: 1, peso: 1 },
      { clave: 2, peso: 1 },
    ];
    const resultado = reparto(100, partes, { ordenResiduo: ascendenteClaveNumerica });
    expect(resultado.find((parte) => parte.clave === 1)?.monto).toBe(34);
    expect(resultado.find((parte) => parte.clave === 2)?.monto).toBe(33);
    expect(resultado.find((parte) => parte.clave === 3)?.monto).toBe(33);
    expect(resultado.reduce((acc, parte) => acc + parte.monto, 0)).toBe(100);
  });

  it('throws when the comparator returns 0 between two distinct parts and a remainder exists', () => {
    const partes: ParteReparto<string>[] = [
      { clave: 'a', peso: 1 },
      { clave: 'b', peso: 1 },
    ];
    // 101 split 1:1 leaves a 1-cent remainder that MUST be assigned
    // deterministically; a comparator that never distinguishes cannot do that.
    expect(() => reparto(101, partes, { ordenResiduo: () => 0 })).toThrow();
  });

  it('throws on an empty list of parts', () => {
    expect(() => reparto(100, [], { ordenResiduo: ascendenteClaveNumerica })).toThrow();
  });

  it('throws when the sum of weights is zero', () => {
    const partes: ParteReparto<string>[] = [
      { clave: 'a', peso: 0 },
      { clave: 'b', peso: 0 },
    ];
    expect(() => reparto(100, partes, { ordenResiduo: descendentePesoAscendenteClave })).toThrow();
  });

  it('throws on a negative total', () => {
    const partes: ParteReparto<string>[] = [{ clave: 'a', peso: 1 }];
    expect(() => reparto(-1, partes, { ordenResiduo: descendentePesoAscendenteClave })).toThrow();
  });
});
