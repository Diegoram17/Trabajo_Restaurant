-- Operational day and forward-only vigencia (BACKLOG #2, TECH-DESIGN.md,
-- ADR-0022, ADR-0028). `dia_operativo()` lives exactly once, in the
-- database: no other point in the schema or the backend recomputes the
-- 05:00 America/Lima cutoff.
--
-- Item #1's migrations/0001_configuracion.sql deliberately shipped
-- `vigente_desde` as `timestamptz NOT NULL` with no temporal CHECK: no row
-- and no write path existed yet to exercise the rule. This migration closes
-- that deferral with a BEFORE trigger, not a CHECK (design.md decision P1,
-- to be recorded in a future ADR alongside item #3's data-access layer):
--
--   A validated CHECK referencing now() is emitted INLINE in the
--   pre-data section of a pg_dump and re-evaluated row by row during
--   COPY on restore. Every historical effective row -- valid the day it
--   was written -- is in the past today, so a future pg_restore (or an
--   ALTER COLUMN TYPE table rewrite) would fail. CREATE TRIGGER lands in
--   post-data and never re-fires over rows already on disk: the rule
--   becomes "you cannot WRITE an effective date backwards", not "every
--   row must be perpetually in the future".
--
-- Both tables are still empty (item #1 inserted no rows), so this
-- migration needs no backfill.

CREATE FUNCTION dia_operativo(instante timestamptz) RETURNS date
  LANGUAGE sql STABLE STRICT PARALLEL SAFE AS $$
  SELECT ((instante AT TIME ZONE 'America/Lima') - INTERVAL '5 hours')::date;
$$;
-- STABLE, not IMMUTABLE: `timestamptz AT TIME ZONE <text>` depends on
-- tzdata rules, which can change. Declaring it IMMUTABLE would enable
-- indexes and generated columns that could end up silently wrong, exactly
-- what ADR-0028 forbids ("it is never persisted"). Accepted consequence:
-- no index on dia_operativo(vigente_desde) -- a handful of rows per year.

CREATE FUNCTION vigencia_no_retroactiva() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.vigente_desde IS NOT DISTINCT FROM OLD.vigente_desde THEN
    RETURN NEW;
  END IF;
  IF dia_operativo(NEW.vigente_desde) < dia_operativo(now()) THEN
    RAISE EXCEPTION 'vigente_desde % precedes the current operational day %',
      dia_operativo(NEW.vigente_desde), dia_operativo(now())
      USING ERRCODE = '23514', CONSTRAINT = 'vigente_desde_no_retroactiva';
  END IF;
  RETURN NEW;
END; $$;
-- The trigger raises ERRCODE '23514' (check_violation) and CONSTRAINT
-- 'vigente_desde_no_retroactiva', so node-postgres hands back error.code
-- and error.constraint identical to those of a real CHECK: the mapping to
-- a domain error does not know -- and does not care -- which mechanism
-- produced it.

-- One function, two triggers: nothing duplicates the 05:00 cutoff.
-- calendario_apertura_excepcion.fecha gets NO trigger of its own -- it is
-- a declared day hanging off its parent calendar's effective period.
CREATE TRIGGER vigente_desde_no_retroactiva
  BEFORE INSERT OR UPDATE OF vigente_desde ON configuracion_costos
  FOR EACH ROW EXECUTE FUNCTION vigencia_no_retroactiva();

CREATE TRIGGER vigente_desde_no_retroactiva
  BEFORE INSERT OR UPDATE OF vigente_desde ON calendario_apertura
  FOR EACH ROW EXECUTE FUNCTION vigencia_no_retroactiva();
