# ADR 0035: El evento es una señal de invalidación, y el stream se filtra por rol de dispositivo

## Estado

Aceptado — cierra el hallazgo **SEC-02** de `SECURITY-REPORT.md`, el último HIGH del pase de seguridad.
Completa **ADR-0031**, que decidió quién se suscribe al canal y no qué recibe. **Propaga ADR-0013** al
registro de eventos, que era donde no había llegado. **Precisa ADR-0009**, cuya redacción sugería lo
contrario.

## Contexto

La política de acceso de ADR-0031 tiene dos criterios de aceptación sobre el canal SSE, y **los dos
hablan de admisión**:

> - *"El token viaja en cookie `httpOnly` de larga duración, que `EventSource` envía sola: la
>   suscripción al canal SSE no requiere headers ni sesión de persona."*
> - *"Una suscripción al stream **sin dispositivo enrolado se rechaza**."*

Ninguno dice qué recibe cada dispositivo una vez admitido. Y esa omisión choca con una regla de
confidencialidad que el mismo documento declara para el otro canal:

> *"Un mesero **no ve** los ítems ni el total de la cuenta de otro, y la interfaz no le ofrece ninguna
> acción sobre ella."*

Por tRPC la frontera está definida y es del servidor. Por SSE no hay ninguna. Y del otro lado del stream
está `/kds`, que ADR-0016 dejó deliberadamente como la superficie con menos control de todo el sistema:
*"solo lectura y sin sesión"*, que *"no pide identificación en ningún momento"* y *"no se desloguea ni se
bloquea por inactividad, porque no tiene sesión"*. Una pantalla encendida todo el servicio, en una cocina
por la que pasa cualquiera.

Al modelarlo aparece que **la contradicción no es entre seguridad y diseño: es entre dos ADRs**, y una de
las dos redacciones ya era la correcta.

**ADR-0013 decidió que el cliente no replica el dominio.** Su decisión es explícita: *"El cliente mantiene
una **caché de consultas** que los eventos del servidor **invalidan**; no existe un store global
replicando entidades del dominio"*. Bajo esa regla, un evento no transporta la comanda: **avisa que la
consulta de comandas quedó vieja.**

**ADR-0009 lo redactó al revés.** Su decisión dice *"Cada comanda, anulación y cambio de disponibilidad
**se escribe como evento** en una tabla con secuencia monotónica"*, y el modelo de datos siguió esa
lectura: `EventoOperacion` tiene un campo **`payload`**. Leído así, el evento **es** el dato, y el stream
transporta comandas, mesas, meseros y totales — que es exactamente el riesgo que ADR-0031 nombró al
descartar la red local como frontera de confianza, y que después dejó entrar por su propio canal.

Las dos lecturas no pueden ser ciertas a la vez. Y la de ADR-0013 es la que el sistema necesita por un
motivo que no es de seguridad: *"toda divergencia entre ella y el servidor es un error silencioso en un
sistema donde los datos son dinero"*.

Falta un segundo hueco que la propagación sola no cierra. Aunque el evento sea una señal, **señalar ya
dice algo**: *"la cuenta 47 de la mesa 12 cambió"* le cuenta a una tablet robada el pulso completo del
salón. Y una pantalla de cocina no tiene ningún uso para esa señal.

## Decisión

**El evento es una señal de invalidación con destinatario, no un transporte de dominio.**

### 1 — El evento no lleva dominio

`EventoOperacion` pierde el campo `payload` y guarda **qué consulta invalidar**, nada más:

```
EventoOperacion
  secuencia      monotónica
  tipo           qué clase de dato quedó viejo
  alcance        a qué rol de dispositivo le importa
  referencia     el identificador mínimo para dirigir la invalidación
  fecha
```

El cliente recibe la señal, invalida su consulta y **la vuelve a pedir por tRPC** — donde la autorización
ya está resuelta y probada. Es literalmente lo que ADR-0013 decidió; acá solo se aplica al registro de
eventos.

**Con eso la confidencialidad deja de depender del canal.** Hay un solo lugar donde se decide quién ve
qué, y es el mismo que ya decide *"ninguna consulta de autorización mira la mesa"*.

### 2 — El stream se filtra por `Dispositivo.rol`

Porque señalar también dice algo, el servidor entrega a cada suscriptor **solo las clases de evento que su
rol necesita**:

```
ROL         RECIBE

kds         comandas pendientes · anulaciones · re-etiquetado de mesa
            apertura y cierre del servicio de cocina
cocina      lo mismo que kds
estacion    disponibilidad de platos · estado del servicio de cocina
            estado de mesas · cambios en cuentas
```

Una pantalla de cocina **no recibe ninguna señal de cuenta ni de cobro**. No las filtra en el cliente: no
le llegan.

### 3 — La granularidad de cuenta no vive en el stream

La señal de `estacion` dice *"cambió algo en cuentas"*, no *"cambió la cuenta 47 del mesero Pérez"*. La
estación invalida y refetchea, y el refetch devuelve **solo lo que ese mesero puede ver** — o nada, si no
hay sesión abierta.

Esto es lo que permite conservar intacta la propiedad que ADR-0031 protegió a propósito: **la suscripción
sigue sin depender de la persona.** La grilla muestra los agotados antes de que nadie ponga su PIN,
porque los eventos de catálogo y de mesa nunca necesitaron persona; y los de cuenta no filtran nada
porque no llevan nada.

## Alternativas consideradas

- **Dejar el `payload` y filtrar el stream por persona**, abriendo una suscripción por sesión de mesero.
  Viable y es la respuesta habitual. No se eligió porque rompe frontalmente ADR-0031: la sesión de
  `/estacion` se cierra en cada envío y por inactividad (ADR-0014), así que la suscripción se caería y se
  rearmaría decenas de veces por servicio, y la estación *"llegaría desactualizada a cada login"* — que es
  textualmente el motivo por el que ADR-0031 sacó la persona del stream.

- **Dos canales**: uno de dispositivo siempre abierto para catálogo y mesas, y otro de sesión abierto solo
  mientras el mesero está identificado. Viable y conserva la propiedad de ADR-0031. No se eligió porque
  duplica el transporte, la reanudación y la política de archivado para resolver algo que la señal sin
  payload resuelve sin agregar nada. Dos `Last-Event-ID` que reconciliar es más superficie de error que la
  que se cierra.

- **Aceptar la exposición y declararla como riesgo**, dado que el stream es de lectura, el dispositivo
  *"no autoriza ninguna acción"* y el local es único. Viable y coherente con cómo el `PRD.md` maneja otros
  riesgos. No se eligió porque el costo de cerrarlo resultó **negativo**: la corrección era propagar una
  decisión existente, y de paso arregla la contradicción entre ADR-0009 y ADR-0013 que iba a morder en la
  implementación aunque la seguridad no existiera.

- **Mantener el `payload` solo para el KDS**, que es el único consumidor con presupuesto de latencia
  (≤ 3 s) y el que menos datos sensibles necesita. Viable y más rápido. No se eligió porque reintroduce
  la segunda fuente de verdad que ADR-0013 rechazó, en la superficie donde un dato viejo se traduce en un
  plato mal cocinado, y porque el refetch de una cola de comandas es un viaje de red que entra holgado en
  los 3 segundos.

## Consecuencias

- **La confidencialidad tiene un solo lugar donde vive.** Antes había una frontera en tRPC y ninguna en
  SSE; ahora hay una sola, y el canal de tiempo real no puede contradecirla porque no transporta nada que
  contradecir. Es la misma forma de ADR-0017 —*"ninguna consulta de autorización mira la mesa"*—: un
  punto de decisión, no dos.

- **ADR-0031 conserva intacta su propiedad.** El stream sigue sin depender de la persona, la estación
  sigue mostrando los agotados antes del PIN, y cocina sigue sin sesión que se pueda perder.

- **La garantía de ADR-0009 se vuelve más fuerte, no más débil.** Antes la prueba de las 20 comandas
  dependía de reproducir 20 eventos sin perder ni duplicar ninguno. Ahora la reanudación dice *"estás
  atrasado"* y el cliente pide la cola completa: **el orden FIFO y la ausencia de duplicados salen de la
  consulta del dominio, no de la fidelidad del replay.** Duplicar deja de ser posible en vez de ser
  improbable — el mismo movimiento que ADR-0029 hizo con el doble conteo del combo.

- **La política de archivado pendiente deja de ser un riesgo de datos.** El `TECH-DESIGN.md` declara que
  el registro de eventos crece sin límite y necesita archivado. Con el evento como señal, **purgarlo no
  pierde nada**: un cliente que reanuda desde un ID ya purgado recibe *"resincronizá todo"* y refetchea.
  Antes, purgar hubiera podido perder el contenido de un evento no entregado.

- **Costo: más viajes de red, y justo donde la red está peor.** Es el costo que ADR-0013 ya declaró
  —*"cada invalidación cuesta un viaje de red… con la red degradada la interfaz se siente más lenta"*— y
  que ahora también paga el KDS. Su advertencia sobre agrupar ráfagas pasa de recomendación a requisito:
  veinte comandas seguidas no pueden disparar veinte refetches de la misma cola.

- **Costo: un campo más de disciplina en cada evento.** El `alcance` hay que ponerlo bien en cada tipo de
  evento nuevo, y equivocarse es silencioso en la dirección peligrosa: un evento marcado de más llega a
  quien no debía y nadie lo nota. El default tiene que ser el rol más restrictivo, no el más amplio — el
  mismo criterio de lista blanca de ADR-0027.

- **Costo: `EventoOperacion` pierde poder de depuración.** ADR-0009 valoraba que *"el historial de eventos
  es consultable con SQL, lo que hace depurable la pregunta «por qué esta comanda no apareció en
  cocina»"*. Sin `payload`, esa consulta dice que la señal se emitió, no qué decía. La comanda sigue
  estando en su propia tabla, así que la pregunta se responde igual — pero con dos consultas en vez de
  una.

- **No cierra la exposición del dispositivo robado, la acota.** ADR-0031 aceptó que *"si alguien se lleva
  la tablet de la cocina, se lleva la lectura del stream hasta que se revoque"*. Sigue siendo cierto, pero
  ahora lo que se lleva es el pulso de la cocina —qué comandas hay— y no el del salón con su dinero. El
  costo declarado en aquel ADR pasa a ser exacto, que antes no lo era.
