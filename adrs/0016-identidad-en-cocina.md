# ADR 0016: Cocina — sin identidad de usuario, y con autoridad sobre la ventana de servicio

## Estado

Aceptado, **enmendado en tres puntos** por el PRD v1.4 y v1.5. El resto del ADR sigue vigente — en
particular el marcado en dos pasos, el inventario escrito solo al terminar la orden, la unidad *sin
insumo*, el bloqueo duro del cierre con órdenes pendientes y la autoridad de cocina sobre la venta de
comida del salón.

- **La identidad** — ver **ADR-0018**. Cocina sigue sin identidad de persona y sin sesión, pero el
  **ciclo del servicio** (abrir y cerrar) ahora se protege con un PIN único y compartido, administrado
  por el administrador.
- **La asimetría de apertura** — ver **ADR-0019**. La sección *"El corte tiene una asimetría deliberada
  con la apertura"* queda **anulada**: con el servicio sin iniciar ya **no** se puede enviar comida. La
  regla pasó a ser simétrica. Con eso también queda sin objeto el riesgo derivado que este ADR declaraba
  —la comanda que llega antes del inicio y no puede quedar invisible—, porque esa comanda ya no puede
  llegar: se rechaza.
- **El mecanismo de la identidad de dispositivo** — ver **ADR-0031**. El principio de este ADR —*"identidad
  de dispositivo y de ubicación física, no de persona"*— no tenía implementación. Ahora es una credencial de
  dispositivo enrolada desde `/admin`, que autoriza leer el stream SSE y ser esa pantalla, y **ninguna
  acción**. Cocina sigue sin sesión de persona y el marcado sigue sin pedir nada.
- **La cadencia del servicio** — por el **PRD v1.5**. El párrafo *"Hay varios servicios por día. Se cierra
  al terminar el almuerzo y se abre de nuevo para la cena"* queda **anulado**: el PRD fija ahora **un
  servicio por día**, que abre con el negocio y cierra con él, y que **no se cierra entre almuerzo y
  cena**. `ServicioCocina` **no cambia** —sigue siendo una fila por servicio, y reabrir sigue sin existir
  como estado—, pero lo que antes era el turno de la cena pasó a ser la **reapertura excepcional** de
  ADR-0019. La diferencia importa: una era rutina y la otra es una salida de excepción, y el modelo las
  representa igual.

## Contexto

El hallazgo #6 de `REVISION-ADVERSARIAL.md` reportó que la autenticación estaba decidida **solo** para la
estación del mesero (ADR-0014), y que cocina era el caso incómodo: una pantalla fija de pared,
desatendida, cuyo operador la toca cada varios minutos. Si heredaba la política de ADR-0014 —sesión corta
con cierre por inactividad— **se desloguea sola en pleno servicio**.

Sobre eso se apilan tres exigencias que no se pueden satisfacer con una sola pantalla:

- ADR-0006 puso todo el peso en un botón: marcar una comanda como preparada **es la escritura de
  inventario del sistema**. Consume lotes FIFO, dispara el agotado automático y fija el costo de la venta.
- `DESIGN.md` especifica el KDS para lectura a **1.5–2.5 m**, con nada por debajo de 22px y el número de
  mesa en 64–80px, y el botón "Preparada" en 72px porque *"se toca con el dorso de la mano"*. Leer a dos
  metros y tocar con precisión son requisitos de distancia distintos.
- El PRD promete una contingencia: si el KDS queda fuera de servicio, la cola tiene que seguir siendo
  consultable para que la cocina opere con el hardware ya instalado.

Y una restricción que define todo lo demás: **el personal de cocina no ficha.** El control de turno con
apertura y cierre por persona existe **solo para el mesero**, porque ahí el turno es la unidad que
consolida dinero — es lo que hace computable el `CierreTurno`. En cocina no hay nada que consolidar: hay un
puesto que se ocupa durante el servicio.

## Decisión

**Cocina no tiene identidad de usuario en ninguna de sus dos vistas.** No hay login, no hay PIN, no hay
sesión y no hay turno de cocina.

Son dos vistas, separadas por una razón física —lo que se lee a dos metros no se toca con precisión:

- **KDS (`/kds`)** — pantalla grande de pared. **Solo lectura, sin sesión, siempre abierta.** No escribe
  nada, así que no necesita identidad.
- **Estación de cocina (`/cocina`)** — táctil, dentro de la cocina, al alcance de la mano. Es la única
  vista de cocina que escribe. **Se inicia al empezar el servicio: quien llegue primero le da inicio, sin
  identificarse.** Desde ese momento, cualquier cocinero marca los platos que ya están realizados.

Lo que autoriza la escritura es que **la estación esté iniciada y sea el dispositivo de la cocina** —
identidad de dispositivo y de ubicación física, no de persona.

### El marcado tiene dos pasos, y solo el segundo cuesta

Cocina no marca "preparada" de una vez. Marca en dos niveles:

1. **Cada unidad, como *lista*.** Unidad, no línea: dos ceviches en la misma orden son **dos filas
   independientes**, cada una con su propio marcado. Es **reversible** — si el cocinero se equivocó,
   deshace y la unidad vuelve a pendiente.
2. **La orden completa, como *terminada*.** Disponible solo cuando todas sus unidades están listas. Es
   el paso que **no** tiene vuelta.

**El inventario se escribe únicamente en el paso 2.** El "listo" por unidad es estado de trabajo de
cocina y no toca el libro de movimientos, y por eso **deshacer sale gratis**: no hay nada que revertir.
Es lo que mantiene el libro append-only de ADR-0005 sin movimientos de reversa, y lo que evita tener que
decidir a qué lote FIFO "vuelve" un insumo desconsumido.

La orden terminada pasa a una **pantalla de historial** que el cocinero puede consultar: qué se cocinó,
en qué mesa, bajo qué pedido y qué mesero lo mandó.

**Una unidad que no se puede preparar** —porque el insumo no estaba, que es un caso que el PRD admite a
propósito— se marca como **sin insumo** con motivo. Eso la anula sin descontar inventario, avisa al
mesero de esa mesa y entra a la **bandeja de incidencias del administrador**, el mismo lugar donde ya
caen los desfases de stock. Es la única acción de cocina que no es marcar, y existe porque sin ella el
bloqueo del cierre no tendría salida.

### Cocina abre y cierra la ventana de servicio

La misma estación tiene una acción **Cerrar cocina**, y cerrarla **inhabilita el envío de comida desde el
salón**. Cocina no solo ejecuta: **decide hasta cuándo el salón puede vender comida.**

**No se puede cerrar con órdenes pendientes.** Es un bloqueo duro, no una advertencia: hay que
terminarlas —o marcar sus unidades como *sin insumo*— antes de cerrar. Con eso, el caso borde del PRD
*"comanda que queda sin marcar como preparada al cierre del turno"* **deja de poder existir**.

> **ANULADO por el PRD v1.5 — ver el tercer punto del *Estado*.** El párrafo que sigue describe varios
> servicios por día como operación normal. Hoy rige **un servicio por día**; un segundo servicio es la
> reapertura excepcional de ADR-0019, no el turno de la cena. Se conserva el texto como registro de por
> qué `ServicioCocina` es una fila por servicio y no un interruptor, que es lo único que sobrevive.

~~**Hay varios servicios por día.** Se cierra al terminar el almuerzo y se abre de nuevo para la cena:~~
`ServicioCocina` es una fila por servicio, no por día. Eso también resuelve gratis el cierre por error —
se abre un servicio nuevo — y hace que "cocina abierta" nunca mienta durante las horas en que no hay
nadie cocinando.

**Lo que cierra es la cocina, no el local.** Un plato lleva `requiere_cocina`, y con la cocina cerrada
sigue vendiéndose lo que no la necesita: una gaseosa o una cerveza sí, una chicha morada no. *(El motivo
que este párrafo daba —"porque tiene receta"— quedó **corregido por el PRD**: la marca `requiere_cocina`
es **manual** y no se deduce de la categoría ni de tener receta. La chicha requiere cocina porque alguien
la prepara, no porque tenga receta; la gaseosa **también tiene receta** y no la requiere.)* **Se puede abrir mesa nueva**, porque una mesa que solo toma bebida es una venta legítima.

El flujo de negocio que esto modela es humano y precede al sistema: llegada cierta hora el cocinero avisa
que va a cerrar, los meseros preguntan a sus clientes si quieren algo más, entran los últimos pedidos, y en
un momento determinado el cocinero cierra. **El aviso previo es verbal y queda fuera del sistema**; lo que
el sistema modela es el corte.

Dos reglas que el corte **no** toca, y que son las que lo hacen viable:

- **El cobro sigue funcionando.** Una mesa abierta se puede cobrar después de cerrada la cocina. Lo
  contrario haría que cerrar la cocina impidiera al negocio cobrar lo que ya vendió.
- **El cierre de turno del mesero sigue funcionando**, porque depende del cobro, no de la cocina. Los dos
  cierres son **independientes**: nadie espera a nadie, y no existe un "cierre de día" — el margen diario
  del PRD se calcula por fecha de venta, así que no necesita que alguien declare el día terminado.

Y el corte tiene una **asimetría deliberada** con la apertura: con la cocina **cerrada** no se envía
comida, pero con el servicio **sin iniciar** sí se envía, con un aviso al mesero de que cocina todavía no
abrió. La razón es de riesgo, no de coherencia: un cierre es una decisión que alguien tomó, y un "sin
iniciar" es casi siempre un olvido. Bloquear el olvido frenaría el salón entero hasta que alguien camine
hasta la cocina.

El corte se aplica en el **backend** (ADR-0013): una comanda enviada en el instante exacto del cierre se
**rechaza en el servidor**, no se oculta en el cliente. Una regla de dinero que solo vive en la interfaz no
es una regla.

Reabrir no existe como estado: si se cerró por error, se **inicia un servicio nuevo**. `ServicioCocina` es
una fila por servicio, no un interruptor.

## Alternativas consideradas

- **Turno de cocina con PIN de entrada y salida**, simétrico al del mesero, y el turno abierto como
  autorización. Es la primera versión de este ADR y **se descartó**: cocina no ficha, así que el turno
  sería una ceremonia inventada solo para tener a quién atribuirle el marcado. Y un turno que nadie
  necesita es un turno que nadie va a cerrar — quedaría abierto de un día para el otro y la atribución
  que prometía sería falsa.
- **PIN en cada marcado** — viable y estrictamente superior en trazabilidad: daría atribución por persona
  a la escritura de inventario, que es lo que uno querría para el control más consecuente del sistema. No
  se eligió por la física de la tarea: el botón mide 72px justamente porque se toca con el dorso de la
  mano, y exigir cuatro dígitos ahí es pedirle al cocinero que se lave las manos por cada plato.
- **Una sola pantalla táctil grande que lea y escriba** — un artefacto menos. No se eligió porque colapsa
  dos distancias de uso incompatibles: lo que se lee a dos metros no se toca con precisión, y lo que se
  toca con precisión no se lee a dos metros.
- **Estación siempre viva, sin inicio de servicio** — todavía más simple. No se eligió porque el inicio da
  un punto explícito de apertura del servicio y es lo que enciende la cola en la pantalla grande. Sin él,
  no hay forma de distinguir "cocina cerrada" de "cocina sin comandas".

## Consecuencias

- El KDS **no puede desloguearse en pleno servicio**, porque no tiene sesión que perder. Es la propiedad
  que se buscaba, y ahora se obtiene sin condiciones: no hay ninguna sesión en cocina.
- El hallazgo #6 queda **cerrado para cocina**, y de la forma más fuerte posible: la pregunta "qué
  identidad tiene un dispositivo de pared" tiene una respuesta explícita —**ninguna, y es deliberado**—
  en lugar de quedar sin decidir.
- **Costo aceptado: la escritura de inventario del sistema es anónima.** Al no existir turno de cocina,
  la `Comanda` solo registra `terminada_en`. "Quién terminó la orden de la mesa 7 a las 20:14" no tiene
  respuesta ni a nivel de persona ni de turno. Si algún día hace falta auditar el consumo de inventario,
  el rastro no existe y hay que agregarlo antes, no después.
- **El hallazgo #13 mejora mucho, y no por el anonimato sino por los dos pasos.** Ese hallazgo observaba
  que "Preparada" era un botón irreversible, sin confirmación y con el área táctil más grande del sistema.
  Ahora el botón grande y frecuente —*listo* por unidad— **no escribe nada y se deshace**, y la escritura
  irreversible ocurre en un paso aparte, con **toda la orden a la vista** y solo cuando todas sus unidades
  ya están listas. El write consecuente dejó de ser el que se toca con el dorso de la mano.
- **El hallazgo #3 mejora.** Ese hallazgo decía que la granularidad de `MovimientoInventario.referencia`
  decidía si el margen por plato existe, y estaba sin definir. Con el marcado por unidad, la referencia
  natural es la **unidad de `ItemComanda`**, que es la granularidad más fina posible y la que hace
  computable el costo por plato. No lo cierra —la decisión formal sigue pendiente— pero le da la respuesta
  obvia.
- **Riesgo derivado que esta decisión obliga a cubrir.** Si el inicio del servicio es lo que enciende la
  cola en la pantalla grande, una comanda que llega **antes** del inicio no puede quedar invisible: el PRD
  fija como criterio de éxito *cero comandas perdidas* y aparición en *≤ 3 segundos*. Por eso la pantalla
  de pared muestra un estado explícito de **cocina sin iniciar con el conteo de comandas en espera**, en
  lugar de una pantalla vacía. Una pantalla vacía y una cocina sin iniciar se ven igual, y no son lo mismo.
- El problema del canal SSE **empeora**: `EventSource` no admite headers, y ahora **ninguna** vista de
  cocina tiene sesión de usuario que pueda autorizar su suscripción al stream. Esta decisión no lo
  resuelve y no debe leerse como que lo hace. El #6 sigue abierto por ese lado y por `/admin`.
- La contingencia del PRD mejora: si la pantalla de pared cae, la **estación de cocina ya tiene la cola y
  ya está iniciada**, y la cocina sigue operando **sin salir de la cocina**. La estación del mesero queda
  como último recurso, con su costo propio — ocupa una de las 3, y el PRD dice que el tiempo de estación
  es un cuello de botella que retrasa la atención de todas las mesas.
- El caso borde del PRD *"comanda que queda sin marcar como preparada al cierre del turno"* **queda
  cerrado por imposibilidad**: el bloqueo duro del cierre no deja que la situación exista. Cocina termina
  cada orden o marca sus unidades como *sin insumo*; no hay una tercera salida.
- **Cocina gana autoridad sobre el salón**, que es una relación nueva en el sistema: hasta acá el salón
  empujaba trabajo a cocina y cocina solo respondía. Ahora una acción de cocina **deshabilita una acción
  del mesero**. Es la dependencia correcta —quien no puede cocinar es quien tiene que poder cortar la
  venta de comida— pero conviene tenerla explícita, porque significa que una estación de cocina caída o
  con un cierre accidental **puede frenar la venta del salón**.
- Riesgo operativo aceptado: el aviso previo ("ya voy a cerrar") **no está en el sistema**. Si un mesero
  toma un pedido treinta segundos antes del corte, el rechazo lo sorprende. El proceso humano lo cubre en
  la práctica; si en uso real resultara frágil, el remedio natural sería un estado intermedio de
  *pre-cierre* visible en las estaciones, y hoy **no existe** a propósito, para no agregar un estado que
  el negocio todavía no pidió.
