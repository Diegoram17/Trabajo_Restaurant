# ADR 0022: Reportes calculados al vuelo, estables por vigencia hacia adelante

## Estado

Aceptado. **Precisado por ADR-0028**: la *fecha actual* contra la que se compara `vigente_desde` es la del
**día operativo**, no la fecha civil del servidor. Sin eso, una vigencia guardada a las 02:00 se leería
contra el día siguiente y se aceptaría una fecha que en la jornada en curso es pasado.

## Contexto

El dashboard del PRD v1.6 pasó de dos cifras a un panel completo: estado de resultados en tres períodos,
ingeniería de menú, tiempos de cocina, rotación de mesas, ticket promedio, concentración del ingreso y
comparativo contra el período anterior. Hay que decidir cómo se computa, y sobre todo **qué garantiza que
un período ya reportado siga dando el mismo número**.

Sobre el cómo, la escala decide sola: un restaurante de salón produce unos cientos de ventas por día. Eso
es SQL agregado sobre las tablas operativas, y cualquier infraestructura analítica sería peso muerto.

Sobre la estabilidad, el sistema ya resolvió la mitad del problema y dejó la otra abierta:

- **Los hechos están congelados.** ADR-0004 hace de la venta cerrada un snapshot inmutable, con
  `costo_fifo_snapshot` por ítem, precisamente para que los reportes históricos sean reproducibles.
- **Los parámetros, no.** `ConfiguracionCostos` está versionada por vigencia, y ADR-0021 versiona igual el
  `CalendarioApertura`. Pero si esas vigencias admiten **fechas retroactivas**, el estado de resultados de
  un mes ya mirado cambia solo cuando alguien corrige un porcentaje o un feriado.

Y hay una restricción de diseño que el sistema tomó a propósito: ADR-0016 dejó escrito que **"no existe un
cierre de día"**, porque el margen se calcula por fecha de venta y no necesita que nadie declare el
período terminado. Cualquier solución que agregue una ceremonia de cierre va contra esa línea.

## Decisión

**Todo se calcula on-demand, y la estabilidad la da la vigencia hacia adelante.**

```
ConfiguracionCostos.vigente_desde  >= fecha actual
CalendarioApertura.vigente_desde   >= fecha actual
```

Ninguna configuración que alimente un importe admite fecha retroactiva. Con eso, un período pasado es
estable **por construcción**: sus ventas están congeladas por ADR-0004 y ninguno de sus parámetros puede
cambiar. **No se agrega ninguna acción de cerrar día, semana ni mes.**

## Alternativas consideradas

- **On-demand con cierre de mes** — permitir correcciones retroactivas y congelar el estado de resultados
  con una acción explícita de cerrar el mes. Era viable y tenía una ventaja concreta: deja arreglar el
  error de carga de hace dos semanas, que con la opción elegida queda sin remedio. No se eligió porque
  agrega una ceremonia que el negocio no pidió y que este sistema evitó a propósito, y porque desplaza el
  problema en vez de resolverlo: un mes que nadie se acordó de cerrar sigue moviéndose, y el usuario no
  tiene forma de saber cuál de los meses que está mirando es firme.
- **Rollup diario materializado** — una tabla de resumen por día, escrita al cerrar cada venta y
  recalculable. Era viable y daría dashboards de tiempo constante. No se eligió porque a esta escala no
  compra nada —unos cientos de ventas diarias se agregan al vuelo sin esfuerzo— y agrega un segundo camino
  de escritura que puede quedar desincronizado del primero. Es el mismo patrón que este diseño ya rechazó
  al derivar el estado de la mesa (ADR-0017) y el estado `demorada` en vez de materializarlos.

## Consecuencias

- Un período pasado **no puede moverse**, y no hace falta que nadie lo declare cerrado. La propiedad se
  obtiene sin ceremonia y sin depender de la disciplina de nadie.
- Los dos invariantes de reconciliación del PRD son verificables en cualquier momento sobre datos vivos,
  no sobre un snapshot que podría haber quedado viejo.
- No hay una segunda fuente de verdad para los números del dashboard, así que no existe la clase de bug
  "el resumen dice una cosa y el detalle otra".
- **Costo: un error de carga viejo no se corrige, se corrige hacia adelante.** Si el administrador cargó
  mal el porcentaje de merma en julio y lo descubre en septiembre, julio se queda como está. Es
  exactamente el mismo trade-off que el PRD ya acepta para las compras corregidas después de haber sido
  consumidas por ventas cerradas, así que al menos el sistema es coherente consigo mismo — pero es una
  limitación real y hay que decirla en la interfaz, no descubrirla.
- **Costo: la carga de configuración pasa a ser urgente.** Un porcentaje o un calendario que se cargan
  tarde ya no se pueden retro-aplicar, así que el día que falten, faltan para siempre. El sistema debería
  avisar cuando un período se está calculando sin configuración vigente, en lugar de reportar un número
  con un cero adentro.
- **Costo: el dashboard es tan rápido como la consulta más pesada.** Hoy eso no es un problema, pero si
  alguna vista empieza a doler, la salida es materializar esa vista puntual — no cambiar el modelo
  general.
