# ADR 0020: El turno es el registro de horas, no la sesión de estación

## Estado

Aceptado — precisa la frontera de ADR-0014. **Su riesgo abierto quedó cerrado por ADR-0024**: el turno
que el mesero deja sin cerrar lo cierra el administrador desde una bandeja, con la hora corregible y con
traza. Ver el último punto de *Consecuencias*. **Precisado por ADR-0028**: *"el primer login **del día**"*
y *"un turno por mesero por jornada"* se leen sobre el **día operativo** (05:00 a 05:00), y lo segundo
describe la operación normal, **no una restricción de unicidad** — un mesero que cierra turno y vuelve en
la misma jornada abre uno nuevo. El invariante que sí rige es que los turnos **no se superpongan**.

## Contexto

El PRD v1.5 agregó fichaje para el mesero: *"el turno arranca cuando marca su ingreso o, si no lo marcó,
con su primer pedido —lo que ocurra primero— y termina con su cierre de turno. Ese intervalo son sus horas
efectivas de trabajo."* Es el único fichaje del sistema; cocina no ficha (ADR-0016 y ADR-0018).

Esa es la redacción original. Al revisarla en el marco de esta decisión se encontró que **"primer pedido"
deja al descubierto un turno entero**: el mesero que entra y no recibe ninguna mesa en toda la jornada no
tendría ningún turno registrado, ni horas cortas. El PRD se ajustó a **"primer login del día"**, y este
ADR documenta por qué.

Eso choca de frente con una lectura ingenua de ADR-0014, que decide que **la sesión de la estación se
cierra automáticamente al enviar el pedido a cocina y por inactividad**. Si las horas se midieran sobre la
sesión, la jornada de un mesero sería una tira de fragmentos de segundos, no un turno.

La confusión es de vocabulario y por eso vale una decisión propia: el sistema tiene **dos objetos de
duración distinta** que hasta ahora se nombraban parecido.

`Turno` ya existía como entidad —mesero, estación de apertura, `abierto_en`, `cerrado_en`— justamente
porque el PRD hace del turno la unidad de consolidación del efectivo. Lo que no estaba decidido es **qué
lo abre**, ahora que ese instante dejó de ser un detalle contable y pasó a ser el inicio de las horas
pagables de una persona.

## Decisión

**Sesión y turno son dos cosas distintas, y las horas son del turno.**

```
Sesión de estación (ADR-0014)     Turno (esta decisión)
  dura una pasada                   dura la jornada
  se cierra al enviar el pedido      se cierra solo con el cierre de turno
  y por inactividad                  del mesero
  muchas por turno                   una por mesero por jornada
  autoriza acciones                  mide horas y consolida dinero
```

**El turno se abre de forma explícita, con respaldo en el primer login.** La pantalla de PIN ofrece una
acción de **marcar ingreso**; si el mesero no la usó, **el primer login del día abre el turno igual**.

El respaldo es el **login** y no el primer pedido, y la diferencia no es menor: si el mesero puso su PIN
en una estación, está trabajando — no hace falta que venda nada para que eso sea cierto. Con el primer
pedido como disparador, un mesero que entra, mira sus mesas y no recibe a nadie en toda la jornada **no
tendría turno en absoluto**: ni horas cortas, sino ningún registro, y tampoco un turno que cerrar.

`Turno` gana un campo: **`origen_apertura`** (`marcado` | `primer_login`), y `cerrado_en` lo escribe el
cierre de turno, que ya existía.

## Alternativas consideradas

- **El primer pedido como respaldo**, que es la letra del PRD v1.5. Se **descartó** al revisarlo: deja al
  descubierto el turno entero de un mesero que entró y no recibió ninguna mesa. El PRD se ajusta.
- **Apertura implícita pura** — el primer login abre el turno y **no existe** la acción de marcar ingreso.
  Era viable, y con el respaldo puesto en el login la diferencia con lo elegido se reduce a una sola cosa:
  la acción explícita. No se eligió porque un fichaje que después se va a contrastar contra horas
  programadas merece un acto declarado y una **superficie donde el mesero vea que su turno arrancó y a qué
  hora**. Si el turno se abre en silencio como efecto colateral de un login, el mesero se entera de su
  hora de inicio recién cuando alguien le discute las horas.
- **Turno derivado del calendario de horarios** — el horario programado materializa el turno y el mesero
  solo lo confirma al llegar. Era viable y hacía que programadas y efectivas compartieran origen, lo que
  simplificaba el contraste del dashboard. No se eligió porque lo simplificaba destruyéndolo: "efectivas"
  pasaría a significar "programadas confirmadas", y la diferencia entre las dos —que es exactamente el
  dato que el PRD quiere ver— desaparecería. Además ataría la operación del salón a que el calendario esté
  cargado.

## Consecuencias

- Queda explícito que **las horas no se miden sobre la sesión**, que es el error que este ADR viene a
  cerrar. ADR-0014 puede seguir haciendo la sesión tan corta como haga falta para acotar el riesgo de la
  estación compartida, sin ninguna consecuencia sobre el fichaje.
- **Un mesero que trabaja siempre tiene turno, venda o no venda.** Un día flojo, una jornada entera sin
  mesas o un turno de apoyo quedan registrados igual. Es el agujero que cerró mover el respaldo del primer
  pedido al primer login, y era un agujero grande: no producía horas cortas, producía **ninguna hora y
  ningún turno que cerrar**.
- Nunca hay actividad sin turno, así que la atribución de ventas, propinas y efectivo tiene siempre un
  turno al que colgarse.
- Los dos orígenes de `abierto_en` son ahora **el mismo acto físico** —el mesero frente a la estación
  tipeando su PIN— separados por segundos, no por horas. `origen_apertura` deja de ser una advertencia
  sobre la comparabilidad del dato y pasa a ser simple procedencia: si el mesero lo declaró o si el
  sistema lo abrió por él.
- **Costo: el turno arranca cuando toca una estación, no cuando llega al local.** El rato de mise en place
  anterior al primer PIN no lo captura nada, y ningún cambio de software lo va a capturar: haría falta un
  reloj de fichaje aparte, que este proyecto no tiene y no está en alcance. Las horas efectivas son
  entonces un **piso**, no la jornada completa, y conviene que el dashboard lo diga.
- **Costo aceptado: el login es un proxy generoso.** Un mesero que entra a la estación a mirar algo y se
  va queda con un turno abierto. Se acepta sin mitigación y por dos razones. La primera es que **no es un
  caso independiente**: lo que deja atrás es un turno sin cerrar, que ya está registrado como caso borde
  abierto, y se manifiesta por el mismo lugar — cualquier salida que se decida para aquel cubre este de
  arriba. La segunda es que detectarlo exigiría inferir la intención de una persona a partir de un login,
  y eso está fuera de lo que un POS puede saber. El administrador ve las horas de sus meseros en el
  dashboard; si el caso apareciera seguido, se corrige hablando, no con una alerta.
- **Riesgo que este ADR dejó abierto y que ADR-0024 cerró.** El mesero que cobra todas sus cuentas y **se
  va sin cerrar turno** deja `cerrado_en` en nulo y las horas corriendo. Cuando se escribió este ADR el
  PRD lo tenía como caso borde pendiente, con tres salidas anotadas y ninguna elegida —cierre automático
  por hora, cierre forzado por el administrador, o turno marcado como incompleto—.
  > **Resuelto por ADR-0024:** se eligió la segunda. El turno abierto **no bloquea a nadie** —al día
  > siguiente el mesero entra con normalidad y se le abre uno nuevo—, cae en una **bandeja del
  > administrador**, y al cerrarlo el sistema **propone** la hora de la última actividad y el
  > administrador puede corregirla, con motivo obligatorio y traza de quién lo hizo. El `CierreTurno`
  > resultante queda marcado como **no firmado por el mesero**. La *cola sucia* que este ADR anticipaba
  > ya no es indefinida: es un pendiente con dueño, con bandeja y con contador.
