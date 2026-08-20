-- Base configuration schema (BACKLOG #1, TECH-DESIGN.md data model,
-- ADR-0039). Ships EMPTY: this file inserts no row, and no configuration
-- parameter column carries a DEFAULT — supplying every value explicitly is
-- item #25's job, not #1's.
--
-- `vigente_desde` ships as `timestamptz NOT NULL` with no temporal CHECK:
-- the forward-only rejection against `dia_operativo()` (ADR-0022, ADR-0028)
-- is item #2's, recorded on BACKLOG row #2.
--
-- `creada_por` ships as `integer NOT NULL` without its foreign key:
-- `Persona` does not exist until item #3, which adds the constraint,
-- recorded on BACKLOG row #3.

CREATE TABLE configuracion_costos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vigente_desde timestamptz NOT NULL,
  salario_cocina integer NOT NULL,
  salario_administrativo integer NOT NULL,
  costos_indirectos_mensuales integer NOT NULL,
  pct_comision integer NOT NULL,
  pct_merma integer NOT NULL,
  pct_igv integer NOT NULL,
  creada_por integer NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vigente_desde)
);

CREATE TABLE calendario_apertura (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vigente_desde timestamptz NOT NULL,
  abre_lunes boolean NOT NULL,
  abre_martes boolean NOT NULL,
  abre_miercoles boolean NOT NULL,
  abre_jueves boolean NOT NULL,
  abre_viernes boolean NOT NULL,
  abre_sabado boolean NOT NULL,
  abre_domingo boolean NOT NULL,
  creada_por integer NOT NULL,
  creada_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vigente_desde)
);

CREATE TABLE calendario_apertura_excepcion (
  calendario_id integer NOT NULL REFERENCES calendario_apertura (id),
  fecha date NOT NULL,
  abierto boolean NOT NULL,
  PRIMARY KEY (calendario_id, fecha)
);

CREATE TABLE configuracion_operativa (
  fila_unica boolean PRIMARY KEY DEFAULT true CHECK (fila_unica),
  umbral_demora_min integer NOT NULL,
  inactividad_sesion_min integer NOT NULL
);
