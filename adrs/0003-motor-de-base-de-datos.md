# ADR 0003: PostgreSQL como motor de base de datos

## Estado

Aceptado

## Contexto

Tres exigencias del PRD recaen directamente sobre el motor:

1. **Concurrencia sobre lotes.** Con 3 estaciones vendiendo a la vez, dos ventas simultáneas pueden
   intentar consumir el mismo lote FIFO. Sin bloqueo a nivel de fila, ambas leen el mismo stock y lo
   consumen dos veces.
2. **Precisión monetaria.** Los criterios de "diferencia 0" exigen aritmética decimal exacta también
   en la base, no solo en la aplicación.
3. **Reportes.** El dashboard agrega ventas por día, hora, plato, mesero y método de pago.

## Decisión

PostgreSQL.

## Alternativas consideradas

- **SQLite** — viable y tentador para un local único: es un archivo, no requiere administración y hace
  que el trabajo corra en cualquier máquina sin instalar servicios. No se eligió por dos límites que
  pegan justo donde el proyecto es más riesgoso: un solo escritor, y ausencia de bloqueo de fila
  (`SELECT ... FOR UPDATE`), con 3 estaciones concurrentes sobre el mismo inventario.
- **MySQL / MariaDB** — viable: `DECIMAL` exacto y `SELECT ... FOR UPDATE` con InnoDB, y muy fácil de
  hospedar. No se eligió por su soporte más limitado de window functions y tipos avanzados, que son la
  herramienta natural para los reportes del dashboard.

## Consecuencias

- `NUMERIC` de precisión arbitraria, `SELECT ... FOR UPDATE` para el consumo FIFO y window functions
  para los reportes, todo resuelto en el motor y no en la aplicación.
- Costo: hay que levantar y operar un servicio, con sus backups y credenciales. El proyecto deja de
  correr con solo clonar el repositorio: necesita Docker o una instancia gestionada, lo que agrega un
  paso de configuración a cualquiera que quiera evaluarlo.
