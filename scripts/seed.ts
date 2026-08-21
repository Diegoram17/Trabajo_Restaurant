// Bootstrap seed (BACKLOG #3, spec: system-bootstrap, proposal Q5/Q8).
//
// `scripts/migrate.ts` executes static .sql verbatim: it can neither compute
// an Argon2id hash nor print a one-time password, and `creada_por` carries
// its FK since 0003_acceso.sql — so the configuration rows must be written
// after the administrator exists, in the same process (design "Seed").
//
// Idempotency is STRUCTURAL, never a pre-check: the persona insert is
// ON CONFLICT (usuario) DO NOTHING and each configuration insert is
// INSERT ... SELECT ... WHERE NOT EXISTS, so a second run is a no-op rather
// than a second effective row.
//
// SECURITY BOUNDARY (spec: One-Time Password Disclosure): the plaintext
// password leaves this process through exactly two doors — the return value
// of `seedArranque` (tests, global-setup) and ONE console.log in the CLI
// entrypoint `main` below. No other function may log, persist or return it.
// tests/unit/sin-contrasena-en-logs.test.ts freezes this structurally.

import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely, type Transaction } from 'kysely';
import { createPool } from '../src/server/db/pool';
import { createDb } from '../src/server/db/kysely';
import { loadDotEnv } from '../src/server/config/env';
import { hashearCredencial } from '../src/server/auth/kdf';
import type { DB } from '../src/server/db/schema';

export interface ResultadoSeed {
  /** The one-time plaintext, present only when it was generated/re-armed. */
  readonly contrasena: string | undefined;
  /** True when this run created the administrator (fresh database). */
  readonly creado: boolean;
}

const USUARIO_ADMIN = 'admin';
// Seeded placeholder name: the real one arrives with #24's personnel ABM.
const NOMBRE_ADMIN = 'Administrador';

/** 24 base64url characters of CSPRNG — comfortably above SEC-09's 12-char minimum. */
function generarContrasena(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Seeds the administrator and the first row of every configuration table in
 * ONE transaction. Seed values are proposal Q8, unchanged: `pct_igv = 1800`
 * and `pct_comision = 500` come from the PRD; every money value is `0` — the
 * only arithmetically inert choice, since a plausible salary produces a wrong
 * margin that still reconciles; `umbral_demora_min = 15` and
 * `inactividad_sesion_min = 5` are declared placeholders, #25's to set.
 * `vigente_desde = now()` clears item #2's vigencia_no_retroactiva trigger
 * because it is the same operational day.
 */
export async function seedArranque(
  db: Kysely<DB> | Transaction<DB>,
  opciones?: { contrasena?: string; regenerarContrasena?: boolean },
): Promise<ResultadoSeed> {
  // Owns the connection (CLI) -> one transaction of its own. Already inside
  // the caller's transaction (tests) -> runs there; Kysely 0.29 does not
  // nest transactions, and the caller's rollback covers the seed either way.
  if (db.isTransaction) {
    return sembrar(db as Transaction<DB>, opciones);
  }
  return db.transaction().execute((trx) => sembrar(trx, opciones));
}

async function sembrar(
  trx: Transaction<DB>,
  opciones?: { contrasena?: string; regenerarContrasena?: boolean },
): Promise<ResultadoSeed> {
  const contrasenaPlano = opciones?.contrasena ?? generarContrasena();
  const contrasenaHash = await hashearCredencial(contrasenaPlano);

  const insertado = await trx
    .insertInto('persona')
    .values({
      nombre: NOMBRE_ADMIN,
      rol: 'administrador',
      usuario: USUARIO_ADMIN,
      contrasena_hash: contrasenaHash,
      debe_rotar_contrasena: true,
      activo: true,
    })
    .onConflict((oc) => oc.column('usuario').doNothing())
    .returning('id')
    .executeTakeFirst();

  let adminId: number;
  let contrasenaDevuelta: string | undefined;

  if (insertado !== undefined) {
    adminId = insertado.id;
    contrasenaDevuelta = contrasenaPlano;
  } else {
    const existente = await trx
      .selectFrom('persona')
      .select('id')
      .where('usuario', '=', USUARIO_ADMIN)
      .executeTakeFirst();
    if (existente === undefined) {
      // Unreachable: a conflict on usuario implies the row exists.
      throw new Error(`ON CONFLICT fired but no persona with usuario '${USUARIO_ADMIN}' exists`);
    }
    adminId = existente.id;

    if (opciones?.regenerarContrasena === true) {
      await trx
        .updateTable('persona')
        .set({ contrasena_hash: contrasenaHash, debe_rotar_contrasena: true })
        .where('usuario', '=', USUARIO_ADMIN)
        .execute();
      contrasenaDevuelta = contrasenaPlano;
    }
    // Otherwise: already seeded, no flag — a pure no-op. No write, no password.
  }

  // Configuration rows, authored by the administrator created above.
  // WHERE NOT EXISTS (whole table) is the "first row only" rule: a second
  // effective row is a #25 versioned write, never a seed.
  await sql`INSERT INTO configuracion_costos
      (vigente_desde, salario_cocina, salario_administrativo, costos_indirectos_mensuales, pct_comision, pct_merma, pct_igv, creada_por)
    SELECT now(), 0, 0, 0, 500, 0, 1800, ${adminId}
    WHERE NOT EXISTS (SELECT 1 FROM configuracion_costos)`.execute(trx);

  await sql`INSERT INTO calendario_apertura
      (vigente_desde, abre_lunes, abre_martes, abre_miercoles, abre_jueves, abre_viernes, abre_sabado, abre_domingo, creada_por)
    SELECT now(), true, true, true, true, true, true, true, ${adminId}
    WHERE NOT EXISTS (SELECT 1 FROM calendario_apertura)`.execute(trx);

  await sql`INSERT INTO configuracion_operativa (umbral_demora_min, inactividad_sesion_min)
    SELECT 15, 5
    WHERE NOT EXISTS (SELECT 1 FROM configuracion_operativa)`.execute(trx);

  return { contrasena: contrasenaDevuelta, creado: insertado !== undefined };
}

async function main(): Promise<void> {
  loadDotEnv();
  const pool = createPool();
  const db = createDb(pool);
  try {
    const regenerarContrasena = process.argv.includes('--regenerar-contrasena');
    const resultado = await seedArranque(db, { regenerarContrasena });
    if (resultado.contrasena !== undefined) {
      // THE single documented print of the plaintext (spec: One-Time
      // Password Disclosure). It never appears in any other output.
      console.log(`Contraseña inicial del administrador (se muestra una sola vez): ${resultado.contrasena}`);
    } else {
      console.log('La base ya estaba sembrada: no se creó nada ni se imprimió ninguna contraseña.');
    }
  } finally {
    await pool.end();
  }
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
