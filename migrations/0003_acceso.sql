-- Access schema (BACKLOG #3, TECH-DESIGN.md data model, ADR-0036/ADR-0043).
-- Four tables in one migration, all empty: slices 2-4 add no DDL, which is
-- what makes their rollback code-only (design "Schema").
--
-- Enumerations are text + CHECK, not native enum types: the migration
-- runner wraps each file in one transaction and `ALTER TYPE ... ADD VALUE`
-- cannot run inside the transaction that adds it (design D3-J).
--
-- No DEFAULT on any column that carries a decision (debe_rotar_contrasena,
-- activo, expira_en, the counters): either default of
-- debe_rotar_contrasena is wrong for one of the roles, so nobody gets to
-- pick one implicitly (item #1's rule).
--
-- `usuario` is UNIQUE and nullable: PostgreSQL allows many NULLs under a
-- unique index, so only administrators occupy the namespace, and the index
-- is also the login lookup. No ON DELETE CASCADE anywhere: a Persona who
-- signed an effective row must not be deletable; deactivation is `activo`.

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

-- FK closure of item #1's deferred debt (migrations/0001_configuracion.sql,
-- lines 10-12). Validates without rewriting the tables and without firing
-- the vigente_desde trigger -- the concrete case ADR-0042 anticipated when
-- it chose a trigger over a CHECK. Both tables are empty, so validation is
-- instant; the mechanism, not the row count, is what makes it safe.
ALTER TABLE configuracion_costos ADD CONSTRAINT configuracion_costos_creada_por_fkey
  FOREIGN KEY (creada_por) REFERENCES persona (id);
ALTER TABLE calendario_apertura ADD CONSTRAINT calendario_apertura_creada_por_fkey
  FOREIGN KEY (creada_por) REFERENCES persona (id);
