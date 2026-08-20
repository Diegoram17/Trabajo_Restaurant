# Delta for Base Schema

## MODIFIED Requirements

### Requirement: `creada_por` References `persona.id`

`creada_por` on `ConfiguracionCostos` and `CalendarioApertura` MUST be `NOT NULL` and MUST carry a
foreign key to `persona.id`, with no default and no synthetic system author. The foreign key MUST
reject an author id that does not exist in `persona`.
(Previously: `creada_por` was `NOT NULL` with no table to reference, since `persona` did not exist
yet; this item closes the FK item #1 left open.)

#### Scenario: Column rejects a null author
- GIVEN the migrated schema
- WHEN a row is attempted with a null `creada_por`
- THEN the insert is rejected by the `NOT NULL` constraint

#### Scenario: Column rejects a nonexistent author id
- GIVEN the migrated schema with `persona` in place
- WHEN a row is attempted with `creada_por` set to an id that does not exist in `persona`
- THEN the insert is rejected by the foreign key constraint

#### Scenario: Seeded rows resolve to a real author
- GIVEN the database seeded by `system-bootstrap`
- WHEN `configuracion_costos.creada_por` and `calendario_apertura.creada_por` are resolved against
  `persona`
- THEN both resolve to the seeded administrator's row, satisfying the foreign key with no
  exception carved out for bootstrap
