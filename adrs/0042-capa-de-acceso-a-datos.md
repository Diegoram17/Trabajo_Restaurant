# ADR 0042: Kysely como capa de acceso a datos

## Estado

Aceptado — decidido por la propuesta de este ítem (`sdd/exactness-core/proposal`, BACKLOG #2) e
implementado en dos mitades: el disparador de `vigente_desde`
(`migrations/0002_dia_operativo_y_vigencia.sql`) y la capa Kysely propiamente dicha
(`src/server/db/kysely.ts`, `src/server/trpc/context.ts`).

## Contexto

El ítem #1 dejó `src/server/trpc/context.ts` vacío a propósito: sin capa de acceso a datos, no había
nada que colgarle al contexto de tRPC sin inventar una forma a ciegas. Ese es el hueco que este ítem
cierra, y con él vienen tres preguntas de forma que ya no se pueden aplazar más.

**Qué ejecuta el dinero y los identificadores.** Toda escritura de dinero necesita viajar como
parámetro ligado, nunca interpolada (ADR-0039), y todo identificador del dominio necesita llegar en
español y en snake_case sin capa de traducción (ADR-0040). La herramienta que arma cada consulta es la
que hace cumplir —o no— las dos reglas.

**Qué impide que `vigente_desde` retroceda.** El ítem #1 dejó la columna sin ninguna restricción
temporal porque no existía fila ni camino de escritura que la ejerciera (ADR-0022, refinado por
ADR-0028). Este ítem sí escribe filas, así que la regla ya no puede seguir aplazada.

**Qué impide que los tipos generados queden desalineados de la base.** Un tipo escrito a mano para las
filas de `configuracion_costos` o `calendario_apertura` se desincroniza en silencio la primera vez que
una migración futura agregue o renombre una columna, y nada avisa si el tipo vive fuera del alcance de
la migración que lo volvió obsoleto.

## Decisión

**Kysely** es la capa de acceso a datos, envolviendo el `pg.Pool` que ya existe (`createPool()`,
`src/server/db/pool.ts`) en vez de crear el suyo propio — una sola fuente de configuración de conexión
y un solo `db.destroy()`.

| Opción | Veredicto |
|---|---|
| Prisma | Fuera — motor de migraciones propio (el ítem #1 ya lo descartó), traduce a camelCase contra ADR-0040, y su `FOR UPDATE` es débil justo donde el ítem #9 lo necesita fuerte |
| Drizzle | Fuera — el esquema TypeScript escrito a mano es una segunda fuente de verdad del esquema, al lado de las migraciones SQL que ya son la fuente |
| `pg` crudo | Fuera — los tipos de fila escritos a mano se desincronizan en silencio en veinte ítems más de backlog |
| **Kysely** | Los tipos se generan *desde* la base ya migrada; `.forUpdate()` es de primera clase (ADR-0007, ADR-0030); el paso por snake_case es gratis; no trae motor de migraciones propio; la plantilla `sql` liga los valores, así que ADR-0039 es el camino por defecto, no una disciplina que alguien puede olvidar |

### El día operativo se protege con un disparador `BEFORE`, no con un `CHECK`

`migrations/0002_dia_operativo_y_vigencia.sql` cierra el aplazamiento del ítem #1 con
`CREATE TRIGGER ... BEFORE INSERT OR UPDATE OF vigente_desde ... FOR EACH ROW`, no con un
`CHECK (dia_operativo(vigente_desde) >= dia_operativo(now()))`.

PostgreSQL sí acepta una función no inmutable (`now()` es `STABLE`) dentro de un `CHECK`, y la evalúa en
cada escritura — así que en uso normal las dos formas se comportan igual. La diferencia aparece cuando
algo **vuelve a evaluar el predicado sobre filas que ya estaban escritas**, y ahí el `CHECK` es una
bomba de tiempo:

- **`pg_dump` → `pg_restore`.** Un `CHECK` validado se emite *inline* en la sección `pre-data` del
  `CREATE TABLE` y se evalúa fila por fila durante el `COPY`. Toda fila histórica —vigente el día que se
  escribió— es pasado hoy: la restauración **falla**. `CREATE TRIGGER` va en `post-data`, después del
  `COPY`, y la carga no lo dispara.
- **Reescritura de tabla** (`ALTER COLUMN ... TYPE bigint`, la salida barata que el ítem #1 dejó
  anotada por si `INTEGER` resulta chico). Un `CHECK` la rompe por la misma razón; un disparador no se
  dispara con una reescritura.
- **`UPDATE` de otra columna sobre una fila vieja.** Un `CHECK` reevalúa el predicado de toda la fila; un
  disparador con `UPDATE OF vigente_desde` más la guarda `IS NOT DISTINCT FROM` no se dispara. El ítem
  #3 va a tocar estas tablas con la FK de `creada_por`, así que esto deja de ser hipotético pronto.

Eso convierte la regla en lo que ADR-0022 pide en realidad: *"no se puede escribir una fecha efectiva
hacia atrás"*, no *"toda fila debe quedar perpetuamente en el futuro"*. Una fila válida el día que se
escribió sigue siendo válida para siempre.

El disparador levanta `ERRCODE = '23514'` (`check_violation`) y
`CONSTRAINT = 'vigente_desde_no_retroactiva'`, así que `node-postgres` devuelve `error.code` y
`error.constraint` **idénticos** a los de un `CHECK` real: el mapeo a un error de dominio no sabe —ni le
importa— qué mecanismo lo produjo, y cambiar de mecanismo no rompe a quien lo consume.

**Alternativa descartada: `CHECK ... NOT VALID`.** Restauraría bien (cae en `post-data`), pero su
ubicación es un efecto colateral del flag: un solo `VALIDATE CONSTRAINT` lo rearma en silencio, y sigue
reevaluando en cada `UPDATE`. Validar solo en la aplicación contradice el criterio de éxito de la
propuesta —*"la base lo rechaza, no la aplicación"*— y el criterio 411 del `TECH-DESIGN.md`.

### Los tipos generados no pueden quedar desactualizados

`kysely-codegen` genera `src/server/db/schema.d.ts` desde la base ya migrada (`npm run db:types`), el
archivo se **commitea**, y `tests/integration/schema-types.test.ts` lo regenera en un archivo temporal
en cada corrida de `npm test` y lo compara contra el commiteado. Si difieren, la prueba falla nombrando
`npm run db:types`.

Como este proyecto no tiene CI y no va a tener (proyecto académico, ADR-0037), `npm test` es el único
portón que existe: una migración que agrega una columna y no regenera los tipos pone la suite en rojo
antes de cualquier fusión, en vez de quedar como una inconsistencia silenciosa que alguien nota meses
después.

Dos trampas que este diseño evita a propósito:

- **Nada regenera el archivo commiteado durante la corrida.** No hay `postmigrate`:
  `tests/setup/global-setup.ts` invoca `npm run migrate` antes de toda la suite, así que un
  `postmigrate` regeneraría el archivo desde la base de pruebas **antes** de la comparación, y el
  portón quedaría verde por construcción, para siempre. La prueba escribe a un archivo temporal y nunca
  al árbol fuente.
- **La comparación normaliza saltos de línea** (`\r\n` → `\n`) antes de comparar: en Windows con
  `core.autocrlf` el archivo commiteado se lee como CRLF mientras el generado vuelve como LF, y un rojo
  falso enseña a ignorar el portón.

**Alternativa descartada: no commitear los tipos y generarlos en `prepare`/`pretest`.** El
desalineamiento sería literalmente imposible, pero `npm run typecheck` empezaría a exigir una base viva,
un clon nuevo no compilaría, el cambio de esquema dejaría de leerse en el diff —que es media razón por
la que este proyecto mantiene el espejo de git— y una base local desactualizada generaría tipos
consistentes con un esquema viejo: el mismo desalineamiento, esta vez sin testigo.

## Consecuencias

- **Toda escritura de dinero y de vigencia pasa por parámetros ligados por construcción.** La plantilla
  `sql` de Kysely los liga; escribir un literal interpolado exige salirse deliberadamente del camino
  normal.

- **`vigente_desde` es rechazable a nivel de base desde este ítem en adelante**, cerrando el
  aplazamiento del ítem #1 sin abrir la bomba de tiempo del `pg_restore`.

- **Los tipos de `configuracion_costos` y `calendario_apertura` no pueden desincronizarse de la base sin
  que `npm test` lo note.** Costo: `npm run db:types` es un paso manual después de cada migración nueva
  — no autoejecutado, porque autoejecutarlo es exactamente la trampa que este diseño evita.

- **Costo: la capa queda atada a `pg` como driver.** Kysely no envuelve otro motor sin cambiar de
  dialecto; es el mismo acoplamiento que ADR-0003 ya aceptó al elegir PostgreSQL por sus bloqueos de
  fila.

- **Costo: no hay índice sobre `dia_operativo(vigente_desde)`.** `dia_operativo()` es `STABLE`, no
  `IMMUTABLE` —depende de reglas de zona horaria que pueden cambiar— así que no puede indexarse ni
  usarse en una columna generada sin mentir sobre su estabilidad. Aceptable: un puñado de filas por año
  en cada tabla versionada.
