# ADR 0021: El día operativo sale de un calendario de apertura propio

## Estado

Aceptado. Ajusta una línea del PRD v1.6. **Precisado por ADR-0028**, que define qué es un *día*: el
`patron_semanal` y las `excepciones[]` se leen sobre el **día operativo** (05:00 a 05:00 hora de Lima), no
sobre la fecha civil. "Abre los sábados" significa la jornada que arranca el sábado a las 05:00.

## Contexto

El PRD v1.6 reemplazó el resultado en dos niveles por un **estado de resultados con período
seleccionable** —día, semana y mes— e imputa los costos fijos mensuales **por día operativo**, con dos
invariantes explícitos: la suma de los días de un mes da el mes, y el costo fijo imputado de un mes
completo suma el 100% del costo cargado.

Eso obliga a definir de dónde sale el conjunto de días operativos, y ese conjunto tiene un requisito que
no es evidente: **tiene que ser conocido de antemano y cerrado**. Si el divisor crece a medida que avanza
el mes, la utilidad de un día ya visto cambia retroactivamente. Un número que se mueve solo destruye la
confianza en el panel más rápido que un número mal calculado.

El PRD dice que los días operativos los define el calendario de horarios. Al modelarlo aparece una
objeción: **que el local abra es un hecho del negocio, no un subproducto de haber cargado los turnos del
personal.** Atar el divisor al calendario de horarios hace que un mes sin turnos cargados deje al estado
de resultados sin divisor — el módulo más importante del sistema roto por una tarea administrativa ajena.

## Decisión

**El día operativo sale de un `CalendarioApertura` propio**, chico e independiente del calendario de
horarios: un patrón semanal más excepciones fechadas.

```
CalendarioApertura
  vigente_desde
  patron_semanal        → qué días de la semana abre el local
  excepciones[]         → fecha + abierto|cerrado (feriados, cierres puntuales)

dias_operativos(mes)    → del calendario, no de las ventas ni de los turnos
costo_fijo_diario(mes)  → ConfiguracionCostos vigente / dias_operativos(mes)
costo_fijo(período)     → costo_fijo_diario × días operativos del período
```

El patrón semanal se **versiona por vigencia**, igual que `ConfiguracionCostos` y por la misma razón:
cambiar cuándo abre el local no debe reescribir períodos ya reportados.

El PRD se ajusta en la línea que atribuía los días operativos al calendario de horarios. El calendario de
horarios sigue existiendo para lo suyo: programar personas y contrastar horas.

## Alternativas consideradas

- **Calendario de horarios** (días con al menos una persona programada) — es lo que decía el PRD y era
  viable sin agregar ninguna entidad, reutilizando un módulo que ya se estaba construyendo. No se eligió
  porque acopla el estado de resultados a una carga de datos que no le corresponde: si el administrador no
  programó los turnos del mes, el sistema no tiene divisor y el resultado no se puede calcular. Es una
  dependencia invertida — lo más importante del producto dependiendo de lo más accesorio.
- **Derivado de las ventas** (días con al menos una venta, recalculado al cierre del mes) — viable, con
  cero carga de datos y auto-mantenido. No se eligió porque **solo funciona en meses terminados**: el día
  1 el divisor sería 1 y todo el alquiler del mes caería sobre ese día; el día 15 el divisor sería 13 y el
  resultado del día 1 habría cambiado sin que nadie tocara nada. Durante el mes en curso —que es cuando el
  administrador mira el panel— todos los números serían provisionales y móviles.

## Consecuencias

- El divisor es **estable desde el día 1** del mes, así que la utilidad de un día no cambia mañana.
- Los dos invariantes del PRD se cumplen **por construcción**, no por cuidado: el conjunto de días que
  recibe la imputación es exactamente el mismo que se usó como divisor.
- El estado de resultados queda **desacoplado** de la carga de horarios y del volumen de ventas. Es
  computable aunque el mes recién empiece y aunque nadie haya programado a nadie.
- **Costo: una entidad y una pantalla más**, en un alcance que el propio PRD ya declara grande. Es chica
  —un patrón semanal y una lista de excepciones— pero existe y hay que mantenerla.
- **Costo: un día planificado como abierto en el que el local terminó sin abrir igual carga costo fijo.**
  Saltearlo rompería el invariante o exigiría recalcular hacia atrás, así que se prefiere el invariante.
  Esto **precisa** la línea del PRD "un día cerrado no carga costo fijo": *cerrado* significa **no
  operativo según el calendario**, no "sin ventas".
- **Costo: el calendario mal cargado desplaza silenciosamente toda la utilidad.** Si dice 30 días
  operativos y el local abre 26, el costo fijo diario queda 13% bajo y cada día del mes se ve más rentable
  de lo que es. El error no se nota en ningún lado: los totales del mes siguen cerrando. Es el mismo riesgo
  por disciplina de carga que el PRD declara para recetas y compras, y merece la misma advertencia.
