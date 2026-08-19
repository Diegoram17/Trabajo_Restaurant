# ADR 0028: El día operativo arranca a las 05:00 y es la única unidad de día del sistema

## Estado

Aceptado — cierra el hallazgo #3 de `REVISION-ADVERSARIAL.md`. Precisa **ADR-0019**, **ADR-0020**,
**ADR-0021**, **ADR-0022** y **ADR-0023**, que se apoyaban en la palabra *día* sin que nadie la definiera.

## Contexto

Cinco decisiones del sistema se apoyan en la palabra *día*, y ninguna la definía:

- *"El **primer login del día** abre el turno"*, con un turno por mesero por jornada (ADR-0020).
- *"**Un servicio por día**: abre con el negocio y cierra con el negocio"* (PRD, ADR-0019).
- Los **días operativos** del `CalendarioApertura`, que son el divisor de todo el costo fijo (ADR-0021).
- El **estado de resultados por día**, con el invariante de que la suma de los días da el mes.
- La **analítica por franja horaria** —ventas por hora, rotación de mesas, tiempos de cocina— (ADR-0023).

Una búsqueda de `medianoche`, `jornada operativa`, `corte del día`, `zona horaria` y `UTC` en `PRD.md`,
`TECH-DESIGN.md` y los 27 ADRs no devolvía **ninguna** coincidencia. Sin decisión, la respuesta la daba por
omisión la fecha civil del servidor — que es una decisión tomada, solo que por nadie.

Y rompe justo en el negocio del PRD. Un restaurante de salón que abre el sábado a las 11:00 y cierra el
domingo a la 01:00 —el propio ADR-0025 habla de *"las noches más movidas"*— produce:

- **Ventas después de medianoche en el día siguiente.** Si el `CalendarioApertura` declara el domingo
  cerrado, esas ventas aterrizan en un día **no operativo**: facturan y no cargan ningún costo fijo,
  mientras el sábado pierde la recaudación de su propio cierre. El total del mes sigue cerrando —por eso
  el error es invisible— pero el resultado **diario**, que es la vista que el administrador mira, queda
  deformado en los dos días.
- **Dos turnos y dos servicios de cocina** para una sola noche, por el mismo corte a medianoche.

Tampoco había dónde apoyarse para inferirlo: ADR-0022 eliminó a propósito toda ceremonia de cierre de día.

## Decisión

**El día operativo arranca a las 05:00 hora de Lima y dura 24 horas. Es la única unidad de "día" del
sistema, y todos sus consumidores usan la misma función.**

```
INICIO_JORNADA = 05:00          constante del sistema, no parámetro
ZONA           = America/Lima   sin horario de verano

dia_operativo(instante) =
    DATE( (instante AT TIME ZONE 'America/Lima') − INTERVAL '5 hours' )

  sáb 23:40  venta          → día operativo SÁBADO
  dom 00:30  venta          → día operativo SÁBADO
  dom 01:00  cierra cocina  → día operativo SÁBADO
  dom 11:00  abre el local  → día operativo DOMINGO
```

Los instantes se almacenan en UTC (`timestamptz`) y el día operativo se **calcula**, nunca se persiste.
Perú no tiene horario de verano, así que la conversión no tiene el caso que suele romper este tipo de
regla: no hay una hora que ocurra dos veces ni una que no ocurra.

**Las 05:00 no son arbitrarias:** caen después de cualquier cierre plausible y antes de cualquier
apertura plausible, en el hueco más ancho del día de un restaurante de salón. Un corte a medianoche parte
el servicio en dos; uno a las 08:00 se cruzaría con la preparación del almuerzo.

**Es una constante, y eso también es la decisión.** No vive en `ConfiguracionOperativa`, que existe para
parámetros que *"no alteran importes, así que no se versionan"* — y el corte **sí** los altera: reasigna
ventas entre días y cambia el resultado diario. Versionarlo tampoco sirve: cambiarlo re-agruparía ventas
ya reportadas, que es exactamente el hallazgo #4. Una constante deja el corte fuera del alcance de
cualquier pantalla de configuración, que es donde tiene que estar.

### Dos precisiones que esta decisión obliga

**`un turno por mesero por jornada` (ADR-0020) es la operación normal, no una restricción de unicidad.**
Con la frontera puesta, un mesero que cierra turno a las 00:30 y vuelve a loguearse a las 00:45 sigue en la
misma jornada. Si eso no pudiera abrir un turno nuevo, habría actividad sin turno — que ADR-0020 prohíbe
explícitamente. Se permite el segundo turno. **El invariante real ya estaba escrito y no cambia:**
`cerrado_en` no puede ser posterior al `abierto_en` del siguiente turno del mismo mesero, es decir, los
turnos no se superponen.

**`un servicio por día` (ADR-0019) también describe la normalidad, no un límite.** El modelo ya
representaba la reapertura excepcional como una fila nueva de `ServicioCocina`. Lo que gana esta decisión
es que la frase por fin es **verdadera** en el caso común: un servicio que abre el sábado y cierra el
domingo a la 01:00 es **uno solo**, dentro de **una sola** jornada. Antes eran dos días y la frase era
falsa sin que nadie lo notara.

## Alternativas consideradas

- **El día operativo es el día civil**, declarando como restricción del producto que el local no opera
  pasada la medianoche. Viable y mucho más barato: `DATE(timestamp)` sería correcto en todos lados y no
  habría ninguna función que olvidar. No se eligió porque es una restricción que el PRD nunca enunció y que
  es falsa para buena parte de los restaurantes de salón reales — y sobre todo porque **si alguna vez se
  viola, falla en silencio**: el resultado diario se deforma y los totales del mes siguen cerrando, así que
  nada lo denuncia.

- **Anclar el día al `ServicioCocina`** — que la jornada sea la ventana de servicio, derivada de la
  operación real en vez de un reloj. Viable en apariencia y elegante. No se eligió porque se rompe en dos
  lugares que el propio diseño creó: una venta de **solo bebidas con la cocina cerrada** no tendría
  servicio al cual colgarse (ADR-0019 la permite, ADR-0026 la costea), y un día en que el local abrió pero
  la cocina no, tampoco tendría día. Ataría el divisor del costo fijo a que alguien se acuerde de abrir la
  cocina, que es la misma dependencia invertida que ADR-0021 rechazó cuando desacopló los días operativos
  del calendario de horarios.

- **Hora de corte configurable.** Viable y aparentemente más flexible. Se descartó por las dos ramas: si se
  versiona, cambiarla re-agrupa ventas ya reportadas y reintroduce el hallazgo #4; si no se versiona,
  reescribe la historia en silencio. Y sería un **tercer parámetro sin valor definido**, cuando el proyecto
  ya arrastra dos.

## Consecuencias

- **Los cinco consumidores comparten una sola definición**, así que el turno, el servicio de cocina, el
  calendario de apertura y el estado de resultados no pueden discrepar sobre qué día es hoy. Antes podían,
  y cada uno lo habría resuelto por su cuenta.

- **El invariante de reconciliación se sostiene.** Los días operativos **particionan el tiempo**: todo
  instante pertenece a exactamente una jornada, sin huecos ni solapes. Por eso la suma de los días sigue
  dando el mes exacto, que es lo que ADR-0021 promete.

- **La noche deja de partirse en dos.** El cierre de un sábado a la 01:00 factura contra el sábado, que es
  el día que cargó su costo fijo y el día en que el mesero trabajó.

- **Costo, y es el grande: ningún `DATE(timestamp)` suelto vuelve a ser válido.** Toda agregación por día
  tiene que pasar por `dia_operativo()`, y la que se olvide **falla en silencio** — devuelve un número
  plausible que no reconcilia. La mitigación es estructural, no de disciplina: la función vive en **un solo
  lugar** de la base y ninguna consulta de reporte usa la fecha cruda.

- **Costo: un mes deja de ser un rango de fechas y pasa a ser un conjunto de jornadas.** El mes de enero
  termina el 1 de febrero a las 04:59, así que una venta del 1 de febrero a las 00:30 cuenta en enero. Es
  correcto y es coherente, pero cualquiera que compare contra un extracto bancario o contra una planilla
  externa va a encontrar diferencias en los bordes, y hay que decirlo antes de que las encuentre.

- **Costo: el eje horario de un día operativo abarca dos fechas civiles.** El gráfico de 24 horas de un
  sábado va de **05:00 a 04:59**, no de 00:00 a 23:59. Si se dibujara con el eje civil, la noche —que es la
  franja más cargada— aparecería cortada al medio y repartida entre dos días. La hora sigue siendo la del
  reloj de pared; lo que cambia es en qué día cae.

- **Costo: cambiar la constante es una migración, no una configuración.** Mover el corte re-agrupa toda la
  historia y rompe la reproducibilidad que ADR-0004 y ADR-0022 sostienen. Queda declarado: **el corte no se
  toca sin recalcular**, y por eso no hay pantalla que lo ofrezca.
