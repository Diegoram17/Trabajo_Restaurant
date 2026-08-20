# Design: Bootstrap, administrator and device (`arranque-admin-dispositivo`)

`BACKLOG.md` item **#3**. Implements `proposal.md` (Engram `sdd/arranque-admin-dispositivo/proposal`),
which already decided the ten open mechanism questions — Argon2id binding, session and lockout storage,
client-IP resolution, seed shape, literal credential columns, `Persona` incrementality, cookie prefixes,
and the four delivery slices. This document does not reopen any of them. It decides **the shapes those
decisions need to exist**: the exact schema, the module boundaries, the request pipeline, and the three
flows that are not obvious from the proposal's prose.

The proposal identified exactly one genuinely new architecture decision. It is now written:
**[ADR-0043](../../../adrs/0043-estado-efimero-de-seguridad-en-postgresql.md) — el estado efímero de
seguridad vive en PostgreSQL, no en el proceso**, with its row in the `TECH-DESIGN.md` decisions table and
the four entities in its data model. Everything below is implementation of ADR-0031/0033/0034/0036/0037/
0038/0039/0040/0041/0042/0043.

## Technical approach

The five-step `node:http` pipeline keeps its shape. Nothing about routing, static serving or the `Origin`
guard changes; **one step is inserted** between the guard and dispatch, and it resolves access for the
request. New modules live in `src/server/auth/*` in `origin-guard.ts`'s style: one exported function per
responsibility, no class, no framework, called **once and unconditionally** from the pipeline rather than
opted into per procedure. That is the `origin-guard.ts` lesson stated in its own header comment — a
per-procedure opt-in is forgotten by the next procedure, which is this project's dominant failure mode.

```
req ─► isForwardedCleartext ─► checkOrigin ─► resolverAcceso ─► /trpc/* | static | SPA | 404
                                                    │
                        ┌───────────────────────────┴───────────────────────────┐
                   leerCookies(req)            resolveClientIp(req, hops)
                   verificarDispositivo(db, cookie, ahora?)
                   verificarSesionAdmin(db, cookie, ahora?)
                                              └─► Contexto { db, ip, dispositivo, sesion, cookies }
```

`resolverAcceso` is a single exported async function. tRPC reaches it through `createContextFactory`,
whose signature already receives `{ req, res }` and discards them today; item #4's SSE `GET` calls the
same function directly from the pipeline. **One resolution path, two call sites, no per-caller opt-in** —
which is exactly what lets #4 "wire it in and add no rule".

The context carries **request-scoped authorization, re-resolved on every request and never memoized**.
This does not contradict D2-G ("a handle, never data"): the rule there forbids caching a *domain* row —
a configuration version that a later effective row would desynchronize (ADR-0013). A device row that was
read for this request and is discarded with it is not a second source of truth.

## Module map (`src/server/auth/*`)

| Module | Exports | Why it is its own module |
|---|---|---|
| `kdf.ts` | `hashearCredencial`, `verificarCredencial` | ADR-0036's **low-entropy** branch: Argon2id. `pin_hash` (#5, #11) reuses it unchanged |
| `token.ts` | `generarToken`, `hashearToken`, `tokenCoincide` | ADR-0036's **high-entropy** branch: CSPRNG + SHA-256 with per-credential salt |
| `cookies.ts` | `leerCookies`, `agregarSetCookie`, `COOKIE_SESION`, `COOKIE_DISPOSITIVO` | The only place that builds a cookie string. Attribute correctness is one edit, not five |
| `ip-cliente.ts` | `resolveClientIp` | Trust boundary over `X-Forwarded-For`; testable without a socket |
| `bloqueo.ts` | `estadoBloqueo`, `registrarFallo`, `registrarAcierto` | The ADR-0031 ladder, once, for all three anchors |
| `sesion-admin.ts` | `crearSesionAdmin`, `verificarSesionAdmin`, `revocarSesionesDePersona` | ADR-0043's session table |
| `dispositivo.ts` | `enrolarDispositivo`, `presentarDispositivo`, `verificarDispositivo`, `rotarTokenDispositivo`, `revocarDispositivo` | ADR-0036's lifecycle; `verificarDispositivo` is #4's entry point |
| `contrasena.ts` | `validarContrasenaNueva`, `CONTRASENAS_COMUNES` | SEC-09 policy, separable from the KDF that stores the result |
| `acceso.ts` | `resolverAcceso` | The single pipeline step that composes the above |

The two ADR-0036 branches are **two modules on purpose**: the module boundary is the entropy question, so
a future secret is classified by which file it imports.

## Schema — `migrations/0003_acceso.sql`

All four tables ship in **one migration, in slice 1**. Slices 2–4 add no DDL: their tables are inert
without a caller, which is precisely what makes the proposal's slice-level rollback code-only.

```sql
CREATE TABLE persona (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('mesero', 'cocina', 'administrador')),
  usuario text UNIQUE CHECK (usuario = lower(usuario)),
  contrasena_hash text,
  debe_rotar_contrasena boolean NOT NULL,
  activo boolean NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credencial_de_admin_completa CHECK (
    CASE rol
      WHEN 'administrador' THEN usuario IS NOT NULL AND contrasena_hash IS NOT NULL
      ELSE usuario IS NULL AND contrasena_hash IS NULL
    END
  )
);

CREATE TABLE dispositivo (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('estacion', 'kds', 'cocina')),  -- no 'admin': ADR-0034
  token_hash bytea NOT NULL,
  token_sal bytea NOT NULL,
  enrolado_en timestamptz NOT NULL DEFAULT now(),
  expira_en timestamptz NOT NULL,
  rotado_en timestamptz,
  revocado_en timestamptz
);

CREATE TABLE sesion_admin (
  id text PRIMARY KEY,                                   -- >=128-bit CSPRNG handle
  persona_id integer NOT NULL REFERENCES persona (id),
  token_hash bytea NOT NULL,
  token_sal bytea NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en timestamptz NOT NULL DEFAULT now(),
  revocada_en timestamptz
);
CREATE INDEX sesion_admin_persona ON sesion_admin (persona_id) WHERE revocada_en IS NULL;

CREATE TABLE bloqueo_acceso (
  ancla text NOT NULL CHECK (ancla IN ('dispositivo', 'cuenta', 'ip')),
  valor_ancla text NOT NULL,
  fallos_consecutivos integer NOT NULL,
  bloqueos_consecutivos integer NOT NULL,
  bloqueado_hasta timestamptz,
  ultimo_fallo_en timestamptz NOT NULL,
  PRIMARY KEY (ancla, valor_ancla)
);

ALTER TABLE configuracion_costos ADD CONSTRAINT configuracion_costos_creada_por_fkey
  FOREIGN KEY (creada_por) REFERENCES persona (id);
ALTER TABLE calendario_apertura ADD CONSTRAINT calendario_apertura_creada_por_fkey
  FOREIGN KEY (creada_por) REFERENCES persona (id);
```

Notes that are decisions, not style:

- **Enumerations are `text` + `CHECK`, not a native `enum` type.** The migration runner wraps each file in
  one transaction, and `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds it — a
  future migration adding a role would have to break the runner's contract. `CHECK` is edited by an
  ordinary `ALTER TABLE`. This sets the precedent for every later enumeration in the model.
- **No `DEFAULT` on any column that carries a decision** (`debe_rotar_contrasena`, `activo`, `expira_en`,
  the two counters). It is item #1's rule — *"a parameter with no decision stays visibly empty rather than
  plausibly full"* — and here it is load-bearing: either default of `debe_rotar_contrasena` is wrong for
  one of the two roles, so nobody gets to pick one implicitly.
- **`usuario` is `UNIQUE` and nullable.** PostgreSQL allows many `NULL`s under a unique index, so only
  administrators occupy the namespace, and the index is also the login lookup.
- **The FK addition validates without rewriting the table and without firing the `vigente_desde`
  trigger.** This is the concrete case ADR-0042 anticipated when it chose a trigger over a `CHECK`: a
  `CHECK` would have been re-evaluated here. Both tables are empty, so validation is instant either way —
  but the mechanism, not the row count, is what makes it safe.
- **No `ON DELETE CASCADE` anywhere.** A `Persona` who signed an effective row must not be deletable;
  deactivation is `activo`.
- `dispositivo` needs no index beyond its primary key: the cookie carries the id.

## Sequence — `/admin` login with the lockout ladder

Two anchors apply to `/admin`: `cuenta` and `ip` (ADR-0034). The `dispositivo` anchor value ships unused,
for #5/#11.

```
POST /trpc/admin.iniciarSesion { usuario, contrasena }
  │ pipeline: isForwardedCleartext ─► checkOrigin ─► resolverAcceso (ip)
  ▼
estadoBloqueo(db, [('cuenta', lower(usuario)), ('ip', ip)])
  │ bloqueado_hasta > ahora en cualquiera de las dos
  ├──────────────────────────────────► { estado: 'bloqueado', restanteSegundos }   ← nada se compara
  ▼ ninguna
SELECT ... FROM persona WHERE usuario = lower($1) AND rol = 'administrador' AND activo
  │                                              │
  │ 0 filas                                      │ 1 fila
  ▼                                              ▼
verificarCredencial(contrasena, HASH_SENUELO)   verificarCredencial(contrasena, fila.contrasena_hash)
  │  mismo costo, mismos parámetros              │
  └──────────────► false ◄──────────────────────┴── false
                     │                                              true
                     ▼                                                ▼
   registrarFallo(db, [('cuenta', …), ('ip', …)])          registrarAcierto  (DELETE × 2)
                     │                                                ▼
                     ▼                                    crearSesionAdmin(db, persona.id)
        { estado: 'rechazado' }                                       ▼
   ← idéntico para usuario inexistente                Set-Cookie: __Host-sesion={id}.{token};
     y para contraseña incorrecta                       Secure; HttpOnly; SameSite=Strict; Path=/
                                                                      ▼
                                              { estado: 'ok', debeRotarContrasena }
```

Three things this flow gets right on purpose:

- **`HASH_SENUELO`** — a decoy Argon2id hash, computed once at module load from 32 random bytes, so a
  missing `usuario` costs the same as a wrong password and the two are indistinguishable in response *and*
  in timing. Computing it at load (instead of hardcoding a PHC string) makes it impossible for the decoy
  to drift away from the configured Argon2id parameters.
- **The `cuenta` anchor is keyed by the typed `usuario`, not by a resolved `persona.id`.** Anchoring on
  the resolved row would leave unknown usernames uncounted, which is enumeration for free — and it would
  make the lockout itself an oracle: only real accounts would ever lock.
- **The blocked branch returns before any hash comparison.** A locked account costs no Argon2id work, so
  the lockout is also the CPU guard on the only expensive path in the process.

### The ladder, atomically

The counter is incremented by **one statement per anchor**, never read-modify-write: the existing
acceptance criterion fires 200 automated attempts, and a lost update there is a silent hole.

```sql
INSERT INTO bloqueo_acceso AS b (ancla, valor_ancla, fallos_consecutivos, bloqueos_consecutivos, ultimo_fallo_en)
VALUES ($1, $2, 1, 0, $3)
ON CONFLICT (ancla, valor_ancla) DO UPDATE SET
  fallos_consecutivos   = CASE WHEN b.fallos_consecutivos + 1 >= 5 THEN 0
                               ELSE b.fallos_consecutivos + 1 END,
  bloqueos_consecutivos = b.bloqueos_consecutivos + (b.fallos_consecutivos + 1) / 5,
  bloqueado_hasta       = CASE WHEN b.fallos_consecutivos + 1 >= 5
                               THEN $3 + make_interval(secs =>
                                    LEAST(60 * (1 << LEAST(b.bloqueos_consecutivos, 4)), 900))
                               ELSE b.bloqueado_hasta END,
  ultimo_fallo_en       = $3
RETURNING bloqueado_hasta;
```

`60 · 2^n` capped at 900 gives 60 → 120 → 240 → 480 → 900 s, which is ADR-0031's ladder with its 15-minute
cap. The shift is clamped at `n = 4` **before** shifting so the expression cannot overflow `integer` after
thirty-one blocks; the whole computation stays in integer arithmetic, with no float anywhere. Success is
`DELETE`, not zeroing: ADR-0031 says the counter *restarts*, and a row that does not exist cannot hold a
stale `bloqueos_consecutivos` that would double the next wait.

## Sequence — device enrolment and presentation

Enrolment produces a token on the administrator's screen; a second, public step is what puts it into the
*device's* cookie jar. Without that step the token has no way to become a cookie on the screen it belongs
to, and the bootstrap chain does not close.

```
/admin (adminProcedure)                          la pantalla, una vez, en /estacion|/kds|/cocina
dispositivo.enrolar { nombre, rol }              dispositivo.presentar { credencial: "{id}.{token}" }
  │                                                │  ← procedimiento público (no hay cookie todavía)
  ▼                                                ▼
token = randomBytes(32)                          estadoBloqueo(db, [('ip', ip)])   ← ADR-0034 §3
sal   = randomBytes(16)                            │ bloqueado ──► rechazo
  ▼                                                ▼
INSERT INTO dispositivo                          verificarDispositivo(db, credencial)
  (nombre, rol, token_hash, token_sal, expira_en)  │ 'valido' ──► Set-Cookie: __Host-dispositivo=
VALUES ($1,$2, sha256(sal||token), sal,            │              {id}.{token}; Secure; HttpOnly;
        now() + interval '90 days')                │              SameSite=Lax; Path=/; Max-Age=7776000
RETURNING id                                       │ otro ──► registrarFallo(('ip', ip)) + rechazo
  ▼                                                ▼
{ id, token }  ← se muestra UNA vez              { rol }   ← la pantalla sabe qué ruta puede presentar
```

`presentar` is anchored on `ip` because ADR-0034 §3 requires that **no attempt without a device be
unlimited**, and this is the only such path item #3 adds. The declared cost is ADR-0034's own: behind one
egress IP, a screen retrying a bad token can lock that IP's login attempts for 60 s. That anchor was
accepted as a backstop precisely for requests already outside the intended path.

Rotation (`rotarTokenDispositivo`) writes a new `token_hash`/`token_sal` and stamps `rotado_en`, keeping
the row and its id — the "suspicion without certainty" exit of ADR-0036, which is exactly what makes it
different from `revocar`, and the difference the `/admin` screen must state in words.

## Sequence — verify and renew (the function item #4 consumes)

```
cualquier request con Cookie: __Host-dispositivo={id}.{token}
  ▼
verificarDispositivo(db, cookie, ahora?)
  ├─ cookie ausente o mal formada ─────────────────────────► { estado: 'ausente' }
  ▼
SELECT d.*, (d.expira_en <= $ahora) AS vencido,
            (d.expira_en <  $ahora + interval '89 days') AS renovable
  FROM dispositivo d WHERE d.id = $1
  ├─ 0 filas ──────────────────────────────────────────────► { estado: 'invalido' }
  ├─ revocado_en IS NOT NULL ──────────────────────────────► { estado: 'revocado' }
  ├─ vencido ──────────────────────────────────────────────► { estado: 'vencido' }
  ▼
timingSafeEqual(sha256(token_sal || token), token_hash)
  ├─ false ────────────────────────────────────────────────► { estado: 'invalido' }
  ▼ true
renovable ?
  ├─ no ───────────────────────────────────┐   ← ninguna escritura
  ▼ sí                                     │
UPDATE dispositivo SET expira_en = $ahora + interval '90 days' WHERE id = $1
  │  + Set-Cookie idéntico con Max-Age nuevo                 │
  └──────────────────┬──────────────────────────────────────┘
                     ▼
       { estado: 'valido', dispositivo, renovada }
```

- **The 89-day threshold is the write bound.** After a renewal `expira_en` is 90 days out, so `renovable`
  cannot become true again until the clock advances a full day: *at most one write per device per day*
  with **no extra column**. `expira_en` throttles itself.
- **The row renewal and the cookie renewal happen together.** Renewing only the row leaves the browser
  dropping a cookie whose row is still alive — a 90-day-late failure on a screen that had been working,
  which is the exact cost ADR-0036 declared for this feature.
- **The typed reason may be surfaced.** `invalido` covers both "no such id" and "wrong token", so the id
  space stays non-enumerable, and every branch that distinguishes `vencido` from `revocado` requires
  already holding a real token. A screen that says *"this device expired, ask the administrator"* leaks
  nothing and saves a support call.
- The rejection union is **not** the PIN rule of ADR-0034 §1. That rule — reject before comparing, with an
  indistinguishable error — governs PIN verification, and it arrives with #5/#11 on top of this function.

## Decisions made here

| # | Decision | Rejected alternatives | Rationale |
|---|---|---|---|
| D3-A | Ephemeral security state in PostgreSQL → **[ADR-0043](../../../adrs/0043-estado-efimero-de-seguridad-en-postgresql.md)** | In-process maps; signed stateless cookie; Redis; counter derived from an attempt log | Render sleeps and restarts, so an in-memory counter silently returns five attempts; a self-contained credential cannot be revoked and needs a **new signing secret with no rotation story** — the cost ADR-0033 regretted and ADR-0037 removed |
| D3-B | **Every temporal comparison happens in SQL**; `ahora` is an optional bound parameter substituting `now()` | Comparing `expira_en`/`bloqueado_hasta` in Node against `new Date()` | Item #2's rule: two clocks means a different answer per layer. The `SELECT` returns `vencido`/`renovable` as booleans, so Node only compares bytes. `ahora` keeps the proposal's simulated-time testability without a second clock in production |
| D3-C | **Both cookies carry `{id}.{token}`** | The bare secret as the whole cookie | Per-credential salt makes "find the row by hash" impossible **by construction** (ADR-0036 declares that cost). A lookup handle is not optional. `sesion_admin.id` is itself a ≥128-bit CSPRNG value because a session row is created on every login, and a sequential handle would publish how many sessions the system ever issued |
| D3-D | Two hash modules, split by **entropy** (`kdf.ts` / `token.ts`) | One `hash.ts` with a mode flag | The module boundary *is* ADR-0036's question, so a future secret gets classified by which file it imports instead of by a parameter someone can pass wrong |
| D3-E | Argon2id parameters are **explicit pinned constants** (m=19456 KiB, t=2, p=1) | Library defaults | The decoy hash must use the same parameters or timing leaks; the PHC string embeds them, so old hashes keep verifying after a change. Defaults that move with a version bump would move the `> 50 ms` floor silently |
| D3-F | Forced rotation is a **server-side gate**: `adminProcedure` rejects everything while `debe_rotar_contrasena` is true, except `admin.rotarContrasena` and `admin.cerrarSesion` | Trusting the UI to redirect | *"Ninguna regla vive en el cliente."* tRPC procedures are reachable by any client on the network (ADR-0010), so a UI-only gate is not a gate |
| D3-G | Rotation **revokes every session of that persona** and issues a fresh one in the same transaction | Keeping the current session alive | ADR-0031 leaves `/admin` with no second factor; a rotation that leaves other sessions open is a formality. The response carries the new `Set-Cookie`, so the operator is not logged out of the screen they are using |
| D3-H | `ultima_actividad_en` is touched **at most once per minute**, gated by the same SQL predicate | Touching on every request | Otherwise every panel read becomes a write. Same self-throttling shape as `expira_en`; the 60-minute window drifts by at most one minute |
| D3-I | The common-password list is a **small embedded module**, not a dependency | `zxcvbn` or a downloaded list | The proposal fixed **two** new runtime dependencies. SEC-09 asks for "contrast against a common-password list", not for a strength estimator |
| D3-J | Enumerations are **`text` + `CHECK`** | Native PostgreSQL `enum` | `ALTER TYPE ... ADD VALUE` cannot run inside the transaction that the migration runner wraps every file in |
| D3-K | `resolverAcceso` runs **once in the pipeline**, feeding both tRPC's context and (in #4) the SSE `GET` | Per-procedure middleware | The `origin-guard.ts` lesson, written in its own header: an opt-in is forgotten by the next procedure |

## Interfaces

```ts
// src/server/auth/token.ts — ADR-0036, high entropy
export function generarToken(): Buffer;                              // 32 bytes, randomBytes
export function hashearToken(token: Buffer, sal: Buffer): Buffer;    // sha256(sal || token)
export function tokenCoincide(token: Buffer, sal: Buffer, hash: Buffer): boolean;  // timingSafeEqual

// src/server/auth/kdf.ts — ADR-0036, low entropy. Async: the threadpool, not the event loop.
export function hashearCredencial(secreto: string): Promise<string>;              // PHC string
export function verificarCredencial(secreto: string, phc: string): Promise<boolean>;

// src/server/auth/dispositivo.ts
export type ResultadoDispositivo =
  | { readonly estado: 'valido'; readonly dispositivo: Selectable<DB['dispositivo']>; readonly renovada: boolean }
  | { readonly estado: 'ausente' | 'invalido' | 'vencido' | 'revocado' };

/** THE single verification path (proposal Q9). Renews `expira_en` to 90 days as part of a
 *  successful verification, writing at most once per device per day. #4 calls it and adds no rule. */
export function verificarDispositivo(
  db: Kysely<DB>, cookie: string | undefined, ahora?: Date,
): Promise<ResultadoDispositivo>;

// src/server/auth/bloqueo.ts — ADR-0031 ladder, ADR-0034 anchors, ADR-0043 storage
export type Ancla = 'dispositivo' | 'cuenta' | 'ip';
export type Sujeto = readonly [Ancla, string];
export type EstadoBloqueo =
  | { readonly estado: 'libre' }
  | { readonly estado: 'bloqueado'; readonly restanteSegundos: number };
export function estadoBloqueo(db: Kysely<DB>, sujetos: readonly Sujeto[], ahora?: Date): Promise<EstadoBloqueo>;
export function registrarFallo(db: Kysely<DB>, sujetos: readonly Sujeto[], ahora?: Date): Promise<EstadoBloqueo>;
export function registrarAcierto(db: Kysely<DB>, sujetos: readonly Sujeto[]): Promise<void>;

// src/server/auth/ip-cliente.ts
/** Takes the entry `hops` from the RIGHT of `X-Forwarded-For` (the rightmost is what the trusted
 *  edge observed; the leftmost is caller-supplied). Falls back to `socket.remoteAddress` when the
 *  header is absent, normalises `::ffff:` IPv4 mapping, and FAILS CLOSED to a constant bucket when
 *  unresolvable — never into "no counter". */
export function resolveClientIp(req: IncomingMessage, hops: number): string;
export const IP_DESCONOCIDA = 'desconocida';

// src/server/trpc/context.ts  (today: { db })
export interface Context {
  readonly db: Kysely<DB>;
  readonly ip: string;
  readonly dispositivo: ResultadoDispositivo;
  readonly sesion: ResultadoSesion;
  readonly cookies: { emitir(valor: string): void };   // appends; never overwrites Set-Cookie
}
```

`cookies.emitir` **appends** to the existing `Set-Cookie` header instead of assigning it. A login that
also refreshes the device cookie emits two, and `res.setHeader('Set-Cookie', x)` twice keeps only the
second — a one-line silent bug that drops a credential.

Cookie strings are built in exactly one place:

```
__Host-sesion={id}.{token};      Secure; HttpOnly; SameSite=Strict; Path=/
__Host-dispositivo={id}.{token}; Secure; HttpOnly; SameSite=Lax;    Path=/; Max-Age=7776000
```

The `__Host-` prefix requires `Secure` **and** `Path=/` **and no `Domain`** — all three are properties of
the single origin ADR-0037 fixed, so the prefix costs nothing here and makes a future `Domain`-scoped
cookie fail loudly instead of silently widening scope.

## Seed — `scripts/seed.ts`

`scripts/migrate.ts` executes static `.sql` verbatim and can neither compute a hash nor print anything,
and `creada_por` now has a foreign key, so the configuration rows must be written **after** the
administrator exists, in the same process.

```ts
export interface ResultadoSeed { readonly contrasena: string | undefined; readonly creado: boolean }
export function seedArranque(
  db: Kysely<DB>, opciones?: { contrasena?: string; regenerarContrasena?: boolean },
): Promise<ResultadoSeed>;
```

One transaction: `persona` (`administrador`, `usuario = 'admin'`, `debe_rotar_contrasena = true`,
`activo = true`) → `configuracion_costos` → `calendario_apertura` (both `creada_por` = the new id) →
`configuracion_operativa`. Idempotency is **structural, not a pre-check**: the persona insert is
`ON CONFLICT (usuario) DO NOTHING` and each configuration insert is `INSERT ... SELECT ... WHERE NOT
EXISTS (SELECT 1 FROM <tabla>)`, so a second run is a no-op rather than a second effective row. Seed values
are the proposal's Q8, unchanged; `vigente_desde = now()` clears item #2's `vigencia_no_retroactiva`
trigger because it is the same operational day.

`npm run db:seed` prints the generated password to **stdout only, once**. `tests/setup/global-setup.ts`
calls `seedArranque` directly and receives the plaintext as a return value, so the fixture never goes
through the print path.

## File changes

| File | Action | Slice | What |
|---|---|---|---|
| `migrations/0003_acceso.sql` | Create | 1 | Four tables + the two `creada_por` foreign keys |
| `src/server/db/schema.d.ts` | Modify | 1 | Regenerated by `npm run db:types`; the drift test is the gate (ADR-0042) |
| `src/server/auth/kdf.ts`, `token.ts` | Create | 1 | ADR-0036's two branches |
| `scripts/seed.ts`, `package.json` | Create/Modify | 1 | `db:seed`; `@node-rs/argon2` and `cookie` pinned |
| `src/server/auth/cookies.ts`, `ip-cliente.ts`, `bloqueo.ts`, `sesion-admin.ts`, `contrasena.ts`, `acceso.ts` | Create | 2 | `/admin` access |
| `src/server/config/env.ts` | Modify | 2 | `TRUSTED_PROXY_HOPS` (default `1`, integer ≥ 0, validated) |
| `src/server/index.ts` | Modify | 2 | `resolverAcceso` step; hops passed from `loadEnv` |
| `src/server/trpc/context.ts`, `router.ts` | Modify | 2 | Cookie-aware async context; `adminProcedure` + the rotation gate (D3-F) |
| `src/server/trpc/app-router.ts` | Modify | 2, 3 | Real routers replace the throwaway procedure |
| `src/server/auth/dispositivo.ts` | Create | 3 | Enrol, present, verify+renew, rotate, revoke |
| `src/client/admin/*` | Create | 4 | Minimal unstyled login, rotation and device screens |
| `tests/unit/*`, `tests/integration/*`, `tests/setup/global-setup.ts` | Create/Modify | all | Real PostgreSQL (ADR-0038); fixture admin |
| `adrs/0043-estado-efimero-de-seguridad-en-postgresql.md` | Create | — | **Written in this phase**, append-only |
| `TECH-DESIGN.md` | Modify | — | **Written in this phase**: ADR-0043 row + four entities + FK note. Acceptance criteria belong to `sdd-spec` |
| `BACKLOG.md` | Modify | 1 | Inherited obligations recorded on rows #5 (`pin_hash`) and #24 (`sueldo_fijo`) |

`schema.d.ts` is generated: excluded from the authored line count, included in snapshot identity.

## Testing strategy

| Layer | What | How |
|---|---|---|
| Unit | `resolveClientIp`: rightmost-of-`hops`, absent header → socket, `::ffff:` normalisation, `hops` > list length → `IP_DESCONOCIDA`, spoofed leftmost entry **ignored** | Pure, fake `IncomingMessage` |
| Unit | `validarContrasenaNueva`: < 12 chars, equal to the seeded/current password, common-list hit — each fails **with its own reason** | Pure |
| Unit | `token.ts`: two enrolments produce unrelated tokens; a one-bit change fails; comparison is `timingSafeEqual` | Pure |
| Unit | Cookie strings carry the literal `Secure`, `HttpOnly`, correct `SameSite`, `Path=/`, no `Domain` | String assertion (ADR-0041: no TLS needed) |
| Integration | Ladder per anchor: 5 → 60 s, next → 120 s, cap 900 s, success deletes the row. Proven **separately** for `cuenta` and `ip` | Real PostgreSQL, `ahora` injected |
| Integration | **Survives a restart**: block, destroy and rebuild the `Kysely`/pool, still blocked | Real PostgreSQL — the point of ADR-0043 |
| Integration | 200 concurrent failed attempts leave `fallos_consecutivos + 5·bloqueos_consecutivos` exact | Parallel connections; catches a lost update |
| Integration | Unknown `usuario` and wrong password: same response **and** same timing envelope | Real PostgreSQL; decoy hash |
| Integration | `/admin` login succeeds **with no device cookie** (ADR-0034) | Real HTTP against `createServer` |
| Integration | Login/rotation `Set-Cookie` is `SameSite=Strict`; `presentar` is `SameSite=Lax`; both `Secure`+`HttpOnly`+`__Host-` | Literal header assertion |
| Integration | Rotation with `debe_rotar_contrasena` true: every other `adminProcedure` is rejected **server-side** before rotating; other sessions die after it | Real HTTP, two cookie jars |
| Integration | Device: revoked, expired and rotated-away tokens all rejected; verification stays far below the 50 ms Argon2id floor | Real PostgreSQL, `ahora` injected |
| Integration | Renewal: a success at day 2 writes nothing; at day 89 renews to 90 and writes **once**; a second call the same day writes nothing | `ahora` injected — the ADR-0036 90-day-late bug, testable today |
| Integration | Seed: from an empty database one admin, three configuration rows with resolvable `creada_por`, no `CredencialCocina` and no `Dispositivo`; a second run changes nothing | Real PostgreSQL |
| Integration | `creada_por` pointing at a non-existent id is **rejected by the database**, not by the app | Real PostgreSQL |
| Integration | Generated types == migrated schema | Existing drift test (ADR-0042) |

The restart test is the one that freezes ADR-0043: without it, somebody moves the counter into a `Map`
six months from now, every other test stays green, and the control silently stops protecting.

## Threat matrix

This change adds no shell command, no VCS/PR automation and no executable-file classification. It adds one
npm-invoked Node script (`db:seed`) with fixed arguments, in the same shape as the existing `migrate`.

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A — no file is classified or executed based on its name |
| Git repository selection | N/A — git is not invoked |
| Commit state | N/A — neither the index nor the working tree is touched |
| Push state | N/A — there is no push |
| PR commands | N/A — there is no PR automation |

The real new trust boundary is **`X-Forwarded-For`**, a client-controllable header the lockout anchor now
depends on, and it is covered by design rather than by matrix rows: the hop count is configuration and not
a constant, only the rightmost `hops` entry is read, and an unresolvable value **fails closed into a
shared bucket, never into "no counter"**. Its RED tests are the four `resolveClientIp` unit cases above,
including the spoofed leftmost entry. The second boundary is the seed's **stdout**: the generated password
is printed once and never logged, never returned by any procedure and never written to a file.

## Migration / rollout

`0003_acceso.sql` runs over four empty tables plus two `ALTER TABLE ... ADD FOREIGN KEY` that validate
instantly. No backfill, no window, no data migration: item #1 shipped the configuration tables empty and
item #2 wrote only rows that rolled back. Rollout is `npm run migrate && npm run db:seed`.

Rollback is the proposal's, unchanged: forward-only migration dropping the two constraints and then the
four tables in dependency order, plus `git revert`. Slices 2–4 revert with code alone because their tables
are inert without a caller. On a database holding real rows, dropping `persona` locks `/admin` out, so the
path is revert code, keep schema, fix forward.

## Open questions

- [ ] **`__Host-` + `Secure` on plain-HTTP loopback.** ADR-0041 already declared that `Secure`/`SameSite`
      behaviour is not verifiable in development. Browsers treat `127.0.0.1` as a secure context and do
      accept `Secure` cookies there, so the minimal `/admin` UI should be walkable locally — but this is an
      **assumption verified by hand**, not by the suite. The suite asserts the literal header (ADR-0041),
      which is what the acceptance criterion actually asks for.
- [ ] **Nothing purges `sesion_admin` or `bloqueo_acceso`.** Declared as debt in ADR-0043's consequences,
      not resolved here. Deleting a `bloqueo_acceso` row *is* forgiving a lockout, so the purge is a
      decision, not a chore.
- [ ] **The `ip` anchor couples `presentar` to `/admin` login behind one egress IP.** ADR-0034 accepted the
      NAT coarseness for a backstop counter; hosting (ADR-0037) makes the shared-IP case more likely than
      that ADR assumed. Worth revisiting if #5 finds it in practice.
- [ ] **`sueldo_fijo` and `pin_hash` are absent from `persona`** by proposal decision Q7. `TECH-DESIGN.md`
      describes the full entity; the columns arrive with #24 and #5. The obligation lives on those BACKLOG
      rows — if it is not written there, it does not exist.
