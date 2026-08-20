---
title: "POS para Restaurantes"
---

# PRD: POS para Restaurantes

> Trabajo práctico académico. El sistema está diseñado como si fuera a operar en un restaurante real
> peruano: los criterios de éxito son demostrables con datos
> simulados, no con un día de operación real.

## Mapa de documentos

Cada cosa se dice **en un solo lugar**. Si algo aparece dos veces, uno de los dos está de más.

| Documento | Responde | No responde |
|---|---|---|
| **`PRD.md`** (este) | qué hace el sistema y qué reglas cumple | cómo se ve ni cómo se construye |
| **`DESIGN.md`** | cómo se ve y cómo se siente | qué acción existe ni qué la habilita |
| **`TECH-DESIGN.md`** | cómo se construye y cómo se verifica | por qué se eligió ese camino |
| **`adrs/`** | **por qué** se decidió, con alternativas y costos | el estado actual del sistema |
| **`CHANGELOG.md`** | qué cambió, cuándo y por qué se reemplazó | lo que rige hoy |

La duplicación no es solo ruido: es la forma en que dos documentos empiezan a decir cosas distintas sin
que nadie se entere. Cuando una regla cambia, se toca **un** archivo.

## Problema

Un restaurante de salón puede tener buenas ventas y aun así no saber si gana dinero. Hoy la
operación y la contabilidad viven separadas: los pedidos se anotan en papel y se cantan a cocina,
las compras de insumos se registran aparte, y el costo de cada plato es una estimación que quedó
desactualizada apenas cambió el precio de un insumo. El resultado es que el administrador decide a
ciegas — no sabe qué plato deja margen real, cuánto le cuesta cada mesero, ni dónde se le va la
utilidad.

En el salón el costo es más inmediato: las comandas en papel se pierden, se leen mal o llegan tarde,
y cada error es un plato que se rehace y se descarta.

Este sistema conecta las dos puntas: cada venta descuenta inventario según la receta del plato y a
su costo real de compra, de modo que la rentabilidad deje de ser una intuición y pase a ser un dato.

## Usuario objetivo

Tres roles operativos dentro de un mismo local, con contextos de uso muy distintos:

- **Mesero** — usuario de mayor frecuencia y, en esta versión, **dueño del ciclo completo de la mesa: la
  toma, la atiende y la cobra**. Trabaja apurado y de pie, en una de hasta 3 **estaciones táctiles
  compartidas**, no en un dispositivo propio. Llega a la estación con el pedido ya anotado en papel y lo
  transcribe. Se identifica con PIN, arma el pedido desde un menú visual, lo manda a cocina y, cuando el
  cliente pide la cuenta, **cobra desde la misma estación** —método de pago, comprobante, propina y
  división de cuenta— sin pasar por un cajero. Al final de su turno hace su propio **cierre de turno**.
  Su tiempo frente a la pantalla es un cuello de botella: si hay cola en la estación, se demora la
  atención de todas sus mesas.
- **Cocina** — trabaja contra **dos pantallas**, y la diferencia entre las dos es física: una pantalla
  de comandas (KDS) fija de pared, que **solo se lee** a distancia y con las manos ocupadas, y una
  **estación táctil** al alcance de la mano donde se marca el avance. Lo que se lee a dos metros no se
  toca con precisión. **Usa un PIN único y compartido por toda la cocina**, no uno por persona: con él se
  abre y se cierra el servicio, y desde ahí cualquier cocinero marca sin volver a identificarse. **Nadie
  ficha turno.** Es el único rol sin identificación individual, y es deliberado: el marcado se hace con
  las manos ocupadas.
- **Administrador** — usuario de menor frecuencia pero de mayor profundidad. Carga menú, recetas,
  compras y estructura de costos, y es el **único** que ve el dashboard de gestión. Es quien recibe
  el valor final del producto.

> **Cambio estructural respecto de v1.1:** el rol de **cajero desaparece**. Cobrar deja de ser una
> estación separada y pasa a ser una responsabilidad del mesero sobre sus propias mesas. Esto elimina el
> traspaso mesero → caja, junta la venta y el cobro en un solo flujo, y hace que la propina y el efectivo
> se atribuyan de forma natural a quien atendió la mesa.

## Objetivo / resultado esperado

Que el ciclo completo de una venta en salón —pedido, cocina, cobro, inventario— ocurra en un solo
sistema y sin papel en cocina, y que de esa operación salga, sin trabajo manual adicional, la
rentabilidad real del negocio.

Si funciona:

- Cocina trabaja contra pantalla, no contra comandas impresas ni cantadas.
- El mesero toma y cobra su mesa en un flujo continuo, sin traspaso a caja.
- El inventario se descuenta solo, al costo al que efectivamente se compró cada lote (FIFO).
- El administrador abre el dashboard y ve qué plato le deja margen, cuánto le cuesta cada mesero y
  cuál es su utilidad estimada — con datos de la operación, no de una planilla aparte.

## Alcance (qué sí incluye esta versión)

La v1 comprende los seis módulos como un único entregable: salón, KDS, cobro, inventario FIFO,
estructura de costos y dashboard. El dashboard es el entregable final y depende de que los otros
cinco estén operativos.

**El día del sistema es el día operativo, y arranca a las 05:00**

Se dice una sola vez porque lo usa todo: el turno del mesero, el servicio de cocina, el calendario de
apertura y cada cifra del dashboard. **Una jornada va de las 05:00 a las 04:59 del día siguiente**, así
que el cierre de un sábado a la 01:00 pertenece al **sábado** y no al domingo. La hora de corte cae en el
hueco más ancho del día de un restaurante —después de cualquier cierre y antes de cualquier apertura— y es
una constante del sistema, no un parámetro configurable: moverla reagruparía ventas ya reportadas.

Dos consecuencias que conviene leer acá y no descubrir después: *un servicio por día* y *un turno por
jornada* describen **la operación normal, no un límite** —un mesero que cierra turno de madrugada y vuelve
a entrar abre uno nuevo—, y un **mes** es un conjunto de jornadas, no un rango de fechas: enero termina el
1 de febrero a las 04:59.

**Quién entra a qué**

Tres llaves distintas, porque protegen cosas distintas. **El equipo** —cada pantalla del local se enrola
una vez y con eso recibe las actualizaciones en vivo, sin identificar a nadie—. **La persona** —el mesero
entra con su PIN de 4 dígitos en la estación; el administrador, con usuario y contraseña, porque trabaja
sentado y por sesiones largas y no tiene el apuro que justifica un PIN corto—. Y **la llave del servicio**
—el PIN de 6 dígitos de cocina, que solo abre y cierra la ventana y no dice quién lo usó (ver *Cocina*)—.

Cinco intentos fallidos bloquean **esa pantalla** por un rato, no a la persona: una estación bajo ataque no
deja sin trabajar a las otras dos. Y el bloqueo **nunca alcanza al marcado de cocina**, porque dejar a un
cocinero sin poder marcar sería peor que el riesgo que evita.

**Toma de pedidos (mesero)**

- Login por PIN en estación compartida; hasta 3 estaciones concurrentes.
- **El turno del mesero es su registro de horas — el turno, no la sesión de estación.** Son dos cosas
  distintas y conviene no confundirlas: la **sesión** dura lo que dura una pasada por la estación y se
  cierra sola por inactividad; el **turno** abarca toda su jornada y atraviesa muchas sesiones. El turno
  arranca cuando **marca su ingreso** o, si no lo marcó, con su **primer login del día** —lo que ocurra
  primero— y termina con su **cierre de turno**. Ese intervalo son sus **horas efectivas de trabajo**. Es
  el único fichaje del sistema: cocina no ficha.
- **El respaldo es el login, no el primer pedido.** Si el mesero puso su PIN en una estación, está
  trabajando: no necesita vender nada para que eso sea cierto. Con el primer pedido como disparador, un
  mesero que entra y no recibe ninguna mesa en toda la jornada no tendría **ningún** turno registrado.
- Las horas efectivas son un **piso, no la jornada completa**: cuentan desde que toca una estación, no
  desde que llega al local. El rato previo no lo captura nada, porque no hay reloj de fichaje.
- Las horas efectivas son un **dato de gestión, no de liquidación**: alimentan el contraste contra las
  horas programadas del calendario, pero los sueldos siguen fuera del sistema (ver *No alcance*) y la
  comisión se sigue calculando sobre la venta neta cobrada, no sobre el tiempo.
- Vista de mesas con estado **libre / ocupada**, distinguidas por **etiqueta y color**, con marca propia
  para **las mesas donde el mesero en sesión tiene una cuenta abierta**.
- **"Ocupada" es información, no un candado.** Solo avisa que alguien más tiene una cuenta abierta en esa
  mesa. No bloquea nada: cualquier mesero puede iniciar un pedido en cualquier mesa, en cualquier momento.
- **La cuenta es del mesero, no de la mesa.** Una mesa puede sostener **varias cuentas abiertas a la vez,
  una por mesero**. Si un mesero abre un pedido en una mesa que ya tiene cuenta de otro, **inicia una
  cuenta nueva e independiente**: cada uno ve, edita y cobra la suya, y nunca la del otro. **No hay
  transferencia** de mesas ni de cuentas entre meseros.
- Selección de mesa y armado del pedido desde menú visual con foto, precio, categoría y combos.
- Pedido registrado con mesa + mesero + hora.
- **Mover la cuenta a otra mesa** cuando el cliente se cambia, con todos sus ítems y comandas. La mesa que
  deja vuelve a *libre* sola si no le quedan otras cuentas, y cocina ve el cambio en su pantalla.
- **Fusionar dos cuentas propias** cuando dos mesas se juntan. Solo entre cuentas del mismo mesero.
- Rondas adicionales sobre la misma cuenta: cada ronda genera una comanda nueva en cocina y se acumula
  en la misma cuenta hasta el pago. Al volver a una mesa donde **ya tiene cuenta propia abierta**, el
  mesero cae sobre esa cuenta y puede **agregar** platos o **cobrarla**.
- Edición y anulación de pedido con motivo registrado. La anulación es **por unidad** (se puede anular parte de una línea, p. ej. 1 de 2 unidades) y el ítem anulado **queda tachado en la cuenta**, no desaparece.
- **Sin cocina abierta no se puede enviar comida. Es una regla dura y simétrica:** da lo mismo que el
  servicio todavía no se haya iniciado o que ya se haya cerrado. Mientras la estación de cocina no tenga
  un servicio abierto, ningún plato que **requiera cocina** se puede enviar. Un plato que nadie está
  mirando es un plato que no se va a cocinar, y el motivo por el que no hay nadie mirando no cambia el
  resultado para el cliente.
- **El mesero no vigila el estado de cocina.** No hay indicador permanente de cocina en su pantalla: no es
  su trabajo. El sistema le avisa **en el momento en que intenta enviar la orden**, y el aviso dice qué sí
  puede hacer: vender lo que no requiere cocina, abrir mesa nueva, cobrar sus cuentas abiertas y cerrar
  turno.
- **Lo que no requiere cocina se vende siempre**, con cocina abierta o no —una gaseosa, una cerveza— y
  **se puede abrir mesa nueva**, porque una mesa que solo toma bebida es una venta legítima.
- **Efecto de la anulación según el estado de la comanda:**
  - *Aún no preparada* — no descuenta inventario. No se produjo nada.
  - *Ya marcada como preparada por cocina* — **descuenta los insumos** (se consumieron de verdad) y
    registra su costo FIFO como **pérdida por anulación**, con el motivo. La venta no ocurre y no
    suma a la comisión del mesero, pero el costo queda visible en vez de desaparecer.
  - *Un ítem que no requiere cocina* — **siempre** cae en el caso anterior, porque su insumo se descuenta
    en el momento del envío: la botella sale de la heladera cuando el mesero la agarra, no cuando el
    cliente paga. Anular una bebida ya enviada registra pérdida por anulación aunque no se haya abierto;
    si el producto se recupera, el administrador lo devuelve al stock con un ajuste desde la bandeja de
    incidencias. Es el precio de que el stock de bebidas baje a tiempo y su plato se marque agotado.

**Cocina (KDS y estación de cocina)**

Cocina son dos superficies: la **pantalla de pared**, que solo se lee, y la **estación de cocina**, que
es la única que escribe. La pared nunca pide nada; la estación pide el **PIN de cocina** para abrir y
cerrar el servicio, y nada más.

- Comandas en orden de llegada (FIFO) con mesa, número de pedido, hora, mesero e ítems.
- **Una fila por unidad, siempre, no por línea.** Cada unidad pedida es su propia fila: cuatro unidades
  del mismo plato son cuatro filas, sin agrupar ni contar. Cada una se marca por separado y cocina necesita
  la correspondencia uno a uno con lo que sale del fuego. (En la cuenta del mesero sí se agrupan, porque
  ahí nadie las toca de a una.)
- **PIN de cocina: único, compartido y sin persona detrás.** La cocina tiene **un solo PIN para todos**,
  no uno por cocinero. No identifica a nadie ni distingue quién lo usa: es la llave de la estación, no una
  credencial personal. Se pide **solo al abrir y al cerrar el servicio**; el marcado de unidades y órdenes
  **nunca** lo vuelve a pedir, porque se hace con las manos ocupadas.
- **Un servicio por día.** La cocina abre **una vez, al abrir el negocio**, y cierra **una vez, al
  cerrarlo**. No se cierra entre almuerzo y cena: el servicio dura el día. **Hasta que el servicio no esté
  abierto, el salón no puede enviar comida** — abrir la estación es lo primero que se hace en la cocina
  (ver *Toma de pedidos*).
- **Reapertura excepcional.** Si el servicio se cerró antes de tiempo o por error, se puede volver a abrir
  el mismo día con el PIN, y queda registrado como una apertura más. Es una salida de excepción, no una
  operación planificada: sin ella, un cierre equivocado dejaría al salón sin poder vender comida hasta el
  día siguiente.
- **Marcado en dos pasos:**
  - *Unidad lista* — cualquier cocinero marca cada unidad cuando sale. Es **reversible**: si se equivocó,
    deshace y la unidad vuelve a pendiente.
  - *Orden terminada* — cuando todas las unidades de una orden están resueltas, se marca la orden como
    terminada. **Este paso no tiene vuelta**, y es el que descuenta inventario (ver *Disponibilidad* y
    *No alcance*).
- **Unidad que no se puede preparar.** Si el insumo no estaba, se marca la unidad como **sin insumo** con
  motivo. Eso la anula sin descontar inventario, avisa al mesero de esa mesa para que hable con el
  cliente, y queda registrada en la bandeja de incidencias del administrador — la misma donde caen los
  desfases de stock, porque son la misma falla vista desde dos puntas.
- **Historial de órdenes terminadas**, consultable por cocina: qué se cocinó unidad por unidad, en qué
  mesa, bajo qué pedido, qué mesero lo mandó y a qué hora. Es de solo lectura: no reabre ni edita.
- **Comanda demorada.** Una orden que supera un umbral de tiempo configurable se muestra como demorada.
  Nadie la marca: se calcula del tiempo transcurrido.
- Notificación de anulación en pantalla.
- **Aviso de cambio de mesa.** Si el mesero mueve una cuenta a otra mesa, las comandas **pendientes** de
  esa cuenta se re-etiquetan y muestran la mesa anterior tachada al lado. Una orden ya terminada no
  cambia: el plato ya salió.
- **Cierre de cocina, con doble freno.** Cerrar la cocina **inhabilita el envío de comida desde todo el
  salón**, exactamente igual que antes de abrir el servicio (ver *Toma de pedidos*), así que la acción pide
  dos cosas antes de ejecutarse:
  - **Confirmación explícita** en un aviso que dice qué se está por hacer y a quién afecta.
  - **El PIN de cocina otra vez.** El mismo código con el que se abrió. No alcanza con haber abierto el
    servicio hace ocho horas: se vuelve a poner.
- **No se puede cerrar con órdenes pendientes**: hay que terminarlas o marcar sus unidades como sin
  insumo.
- Tolerancia a desconexión: las comandas emitidas durante el corte quedan en cola y se muestran al
  reconectar, sin pérdida.
- **Contingencia:** si la pantalla de pared queda fuera de servicio, la **estación de cocina** muestra la
  cola completa y el servicio sigue sin salir de la cocina. Como último recurso la cola es consultable
  desde una estación del mesero, con el costo de ocupar una de las tres.

**Menú, platos y combos**

- Plato: foto, precio, categoría y receta (insumos con cantidades exactas).
- **Marca de "requiere cocina" por plato**, que decide si se puede seguir vendiendo sin cocina abierta.
  La marca es manual y **no se deduce de la categoría ni de tener receta**: una chicha morada es Bebida,
  tiene receta y sí requiere cocina; una gaseosa es Bebida y no. Solo el administrador sabe qué sale de la
  cocina y qué sale de la heladera.
- **Combo: un conjunto de platos existentes con precio propio.** No tiene receta propia — al venderse
  descuenta la receta de cada plato que lo compone, de modo que las recetas nunca se duplican.
  - En *platos más vendidos*, cada componente suma las unidades vendidas dentro de combos.
  - En *platos más rentables*, el precio del combo se reparte entre sus componentes **proporcional al
    precio de lista de cada uno**, de modo que el descuento del combo se distribuya sin favorecer a
    ninguno.
  - **El vínculo con sus platos es vivo, no una copia.** Si cambia la receta de un plato, cambia el costo
    de todos los combos que lo contienen, sin tocar el combo. Esa es la razón de que el combo no tenga
    receta propia: una copia se desactualizaría en silencio, que es exactamente el problema que el
    producto viene a resolver.
  - Un combo queda agotado automáticamente si cualquiera de sus componentes lo está.
  - **Requiere cocina si cualquiera de sus platos la requiere**, y no se marca aparte: se deriva de sus
    componentes, como el costo y el agotado. En el KDS entra como **las unidades de esos platos**, una
    fila por unidad — cocina prepara platos, no combos.

**Disponibilidad de platos**

- Marcado automático de plato como agotado cuando el stock de cualquiera de sus insumos llega a cero.
- Marcado manual de agotado por parte del administrador.
- El plato agotado desaparece de la pantalla de pedidos de todas las estaciones al instante.

**Cobro (mesero)**

- **El cobro lo hace el mesero desde la misma estación**, con un botón **Cobrar mesa** en la pantalla del
  pedido. No hay una estación de caja separada ni un traspaso a otro usuario.
- Envío de la cuenta a cobro indicando boleta o factura.
- **Datos del receptor según el tipo de comprobante**, y su obligatoriedad no es la misma:
  - *Boleta* — DNI, nombre y dirección, los tres **opcionales**. Una boleta sin datos es válida.
  - *Factura* — RUC, razón social y dirección fiscal, **obligatorios**. Sin ellos no se graba el
    comprobante, porque una factura sin receptor no sirve para nada.
- **El comprobante se graba antes del pago**, y su estado es visible. Mientras no esté grabado no se puede
  confirmar el cobro: elegir boleta o factura y cargar sus datos es un paso previo, no un campo más del
  formulario de pago.
- Registro de pago en efectivo o por terminal POS externo (Niubiz, Yape u otro). El sistema
  **registra** el pago; no lo procesa.
- **En efectivo se ingresa el monto recibido y el sistema calcula el vuelto.** Un monto menor al total a
  cobrar **no se puede confirmar**. Si el monto excede el total, la diferencia se ofrece explícitamente
  como propina o como vuelto — nunca se suma a la venta por su cuenta.
- Cada cobro descompone y almacena **venta neta e IGV por separado**, no solo el total. Es la base de
  las comisiones y del estado de resultados.
- El comprobante se modela como entidad propia — tipo (boleta/factura), serie, correlativo, los datos del
  receptor que corresponden a su tipo, y estado. La v1 lo **registra**; no lo emite (ver *No alcance*). El
  modelo queda listo para que un emisor se agregue después sin rediseñar ventas ni reportes.
- División de cuenta sin restricciones (por ítem o por monto), con comprobante, método y propina por
  comensal. La suma de los parciales contra el total de la mesa se muestra **siempre**, con estado en
  **advertencia** mientras no cuadre y en **bien** cuando coincide. El estado se nombra **en palabras y en
  español**, no solo por color.
- Propina: todo monto pagado por encima del total de la cuenta se registra como propina del mesero,
  **separada de la venta** (ver *Propinas*).
- **Atajos de propina** sobre el total de la cuenta (10%, 15%) además del monto libre. Son un acelerador de
  la operación, no una sugerencia al cliente: el mesero ya sabe cuánto dejó y necesita registrarlo rápido.
  Ninguno viene preseleccionado — una propina que el sistema asume es una propina que el negocio se cobra
  solo.
- Al confirmar el pago: se cierra la cuenta y la venta, y se alimentan comisiones y reportes. **La mesa
  vuelve a libre solo cuando no le queda ninguna cuenta abierta** — si otro mesero todavía tiene la suya,
  la mesa sigue ocupada. **El inventario no lo alimenta el pago**: se descuenta cuando cocina termina la
  orden, porque los insumos se van cuando se cocina, no cuando el cliente paga.
- **Confirmación explícita antes de registrar.** Al cobrar —pago completo o dividido— el sistema muestra
  un resumen (total, método, propina, vuelto) y exige una confirmación del mesero antes de cerrar la
  venta, para evitar cobros registrados por error.
- **Atribución por el PIN del mesero en sesión.** No se agrega un login extra de cajero: cada venta,
  propina y cierre queda atribuido al mesero que abrió la estación. La venta y el cobro comparten el
  mismo responsable. Como la cuenta es del mesero que la abrió y nadie más la ve, el responsable es
  siempre el mismo de punta a punta.
- **Un mesero solo cobra sus propias cuentas, desde su propia sesión.** El sistema **no permite** abrir ni
  cobrar la cuenta de otro mesero, cobrar en nombre de otro, ni reasignar un cobro ya registrado. Si un
  mesero le presta el PIN a otro, es un arreglo entre ellos que el sistema no modela ni puede detectar
  (ver *Supuestos y riesgos abiertos*).
- **Cobros realizados del turno.** El mesero puede consultar la lista de mesas que cobró en su turno, y
  abrir cada una para ver el **detalle de consumo** (ítems, cantidades y total) en un pop-up.
- Al cerrarse, la venta **congela su costo de insumos**. Cambios posteriores de receta o de precio no
  alteran ventas ya cerradas, para que los reportes históricos sean reproducibles.

**Propinas**

- Saldo de **propinas por pagar por mesero**, que crece con cada cobro y vuelve a cero cuando el
  administrador las marca como liquidadas.
- El saldo distingue el origen: la propina en efectivo la tiene físicamente el mesero al cierre; la
  propina por terminal POS entró a la cuenta del restaurante y se liquida después.
- Las propinas **no atraviesan el estado de resultados** — no son ingreso ni gasto, solo pasan por el
  negocio.

**Cierre de turno (mesero)**

- Reemplaza al cierre de caja / arqueo. Como ya no hay una caja central con fondo, el cierre es un
  **resumen del turno del propio mesero**: cuánto vendió, cuánto juntó de propinas y cuánto debe
  entregar.
- **No se puede cerrar turno con cuentas abiertas.** El mesero tiene que cobrar **todas** las suyas antes
  de cerrar; una cuenta con cobro parcial (división a medias) cuenta como abierta. El sistema le muestra
  cuáles le faltan y lo lleva a cobrarlas. Como nadie puede cobrar por él, si no las cierra no las cierra
  nadie.
- **El cierre de turno cierra el registro de horas.** Es lo que le pone fin a sus horas efectivas, además
  de consolidar su dinero. Un turno que no se cierra deja las horas abiertas (ver *Casos borde*).
- **Consolidación del turno**, con cada línea expandible al detalle por mesa:
  - Ventas en efectivo.
  - Ventas por terminal POS.
  - Propinas en efectivo.
  - Propinas por terminal POS.
- **Ventas del turno** se muestran **sin propinas** (venta neta de la operación, no el dinero que pasó
  por sus manos).
- **A entregar al cierre** = `efectivo recolectado − propinas en efectivo`, donde
  `efectivo recolectado = ventas en efectivo + propinas en efectivo`. El resultado es exactamente sus
  **ventas en efectivo**: el mesero entrega lo cobrado en efectivo y **se queda con sus propinas en
  efectivo**. Las propinas por POS ya entraron a la cuenta del negocio y se le liquidan aparte.
- No hay fondo inicial, ni conteo de efectivo esperado contra contado, ni diferencia de arqueo: el
  modelo por mesero no maneja una caja física con vuelto centralizado.

**Gestión administrativa**

El administrador trabaja sobre **dos superficies con propósitos opuestos**: *gestión* es donde **escribe**
los datos del negocio, y *dashboard* es donde los **lee**. Ninguna cifra analítica vive en gestión, y
ningún dato se carga desde el dashboard.

- Menú: alta/baja de platos y combos.
- Recetas: lista de insumos con cantidades exactas por plato — el puente entre venta e inventario.
- Compras: registro de insumo, cantidad, precio pagado y **si la compra genera crédito fiscal**
  (proveedor que emite factura) o no (compra sin comprobante).
- Inventario con costeo **FIFO**: cada venta consume primero el lote más antiguo, al precio al que se
  compró.
  - **Compra con crédito fiscal** → el lote se costea a su precio **neto**: el IGV se recupera, no es
    costo del negocio.
  - **Compra sin crédito fiscal** → el lote se costea al **precio pagado completo**.
  - Así el costo de insumos queda en la misma base que las ventas netas, y el margen por plato no
    aparece artificialmente bajo.
- Stock visible en todo momento y alerta de insumo por agotarse.
- Bandeja de incidencias de stock: ventas que dejaron stock negativo, para regularizar.
- **Registro de compras desde inventario.** El administrador registra una compra eligiendo el insumo de
  la lista ya definida, la cantidad, el precio pagado y si genera crédito fiscal; la cantidad se suma al
  stock y actualiza su valor y su estado.
- **Registro de mermas.** Del mismo modo, registra una merma puntual (insumo, cantidad, motivo) que
  reduce el stock. Convierte la merma en un dato registrado, no solo en el % flat estimado (ver nota en
  *No alcance*).
- Estructura de costos:
  - Costos fijos mensuales: salarios flat de cocina y administrativos, sueldo fijo de meseros, costos
    indirectos del local.
  - Costos variables por venta: **comisión del 5% sobre la venta neta (sin IGV) cobrada** por mesero,
    y % flat de merma estimada sobre el costo de insumos consumidos.
- **Costo directo a la vista al fijar el precio.** Al crear o editar un plato o un combo, el administrador
  ve el **costo FIFO de sus ingredientes** y puede aplicarle un margen para determinar el precio. Es
  **solo costo directo**: no entran comisiones, merma ni costos fijos. El **margen efectivo** —con todos
  los costos— lo da el dashboard, y son dos números distintos que el sistema nunca debe presentar como el
  mismo.
- Gestión de personal y sus roles.
- **Calendario de horarios.** El administrador programa los horarios del personal en una vista de
  calendario, que muestra **cuántas horas le programó a cada uno en la semana**. Son las horas
  **programadas**; las **efectivas** las aporta la sesión del mesero (ver *Toma de pedidos*), y el
  dashboard contrasta una contra la otra. Cocina no ficha, así que para cocina el calendario es
  planificación y nada más.
- **Calendario de apertura del local**, aparte del de horarios: qué días abre el negocio, como patrón
  semanal más excepciones (feriados, cierres puntuales). De ahí salen los **días operativos** que el
  dashboard usa para imputar los costos fijos (ver *Dashboard*). Va separado del calendario de personal a
  propósito: que el local abra es un hecho del negocio, y el estado de resultados no puede quedar sin
  divisor porque nadie cargó los turnos del mes.
- **Administración del PIN de cocina.** El administrador define y rota el **PIN de 6 dígitos** con el que
  la cocina abre y cierra su servicio. La cocina lo usa; el administrador lo gobierna.
- **Enrolamiento de dispositivos.** Cada una de las pantallas del local —las 3 estaciones, el KDS y la
  estación de cocina— se enrola una vez desde acá y recibe una credencial **del equipo, no de la
  persona**. Es lo que le permite a una pantalla recibir las actualizaciones en vivo sin que nadie haya
  puesto su PIN, y es lo que hace que la grilla del mesero muestre los platos agotados **antes** de que
  alguien entre. Un equipo que se pierde o se cambia **se revoca desde acá**, sin tocar a los demás.
- **Parámetros del sistema editables**, en un solo lugar: IGV, % de comisión del mesero, % de merma
  estimada y umbral de comanda demorada. Hoy son constantes del negocio, y una constante sin dueño es una
  constante que nadie corrige.
- **Bandeja de turnos sin cerrar.** Lista los turnos de meseros que quedaron abiertos. El administrador
  los cierra y **corrige la hora de salida** si hace falta; el sistema propone la de la última actividad
  del mesero. Cada cierre tardío guarda quién lo hizo, la hora propuesta y el motivo, y su consolidación
  queda marcada como **no firmada por el mesero**.
- **Sin huecos al salir de gestión**, con dos redes:
  - **Validación en el formulario:** un ingreso incompleto no se guarda.
  - **Revisión de pendientes:** una lista de lo que quedó sin definir —platos sin receta, insumos sin
    ninguna compra registrada (margen **no costeable**), platos sin definir si requieren cocina, **PIN de
    cocina sin definir** y **ningún dispositivo enrolado**— visible antes de dar el trabajo por cerrado. Todo hueco acá reaparece deformado en el dashboard semanas
    después, y ahí ya no se sabe de dónde vino.
- Liquidación de propinas por mesero.

**Dashboard de gestión (solo administrador)**

*El resultado — es lo que el producto viene a responder:*

- **Estado de resultados por día, semana y mes.** El mismo cálculo, respondiendo al período elegido:

  `Ventas netas − Insumos consumidos (FIFO) − Merma estimada − Pérdidas por anulación − Comisiones`
  `= Margen de contribución`
  `− Costos fijos imputados (sueldos + indirectos) = Utilidad estimada del período`

- **Los costos fijos se imputan por día operativo, no por calendario corrido.** El costo fijo mensual se
  divide entre los **días que el local opera ese mes** (los define el *calendario de apertura*), y cada
  período suma los días operativos que contiene. No se divide entre 4 semanas ni entre 30 días: esos
  divisores hacen que la vista semanal deje de coincidir con la mensual (el porqué, en `ADR-0021`).
  - **Invariante:** la suma de los días de una semana da la semana, y la suma de los días de un mes da el
    mes, exacto. Un panel cuyas vistas no reconcilian entre sí no se usa dos veces.
  - **Un día no operativo no carga costo fijo.** *No operativo* significa cerrado **según el calendario
    de apertura**, no "sin ventas": un día que el local abrió y no vendió nada igual carga su parte. El
    mes absorbe siempre el 100% del costo.
- **El margen de contribución se muestra siempre como línea propia, arriba de la utilidad.** Es la única
  de las dos que **no tiene ninguna imputación adentro**: se mide. La de abajo lleva un reparto, y por eso
  se rotula como *estimada*.
- Las **propinas no atraviesan ninguno de los dos niveles** (ver *Propinas*).

*El menú:*

- Platos más vendidos, en unidades e ingresos (incluyendo unidades vendidas dentro de combos).
- Platos más rentables: margen real = precio de venta neto − costo FIFO de insumos (+ merma estimada).
- **Matriz de ingeniería de menú.** Cruza **popularidad** (unidades vendidas) contra **margen real** en
  cuatro cuadrantes, para decidir qué promover, a qué revisarle el precio y qué sacar de la carta. Los dos
  ejes ya existen por separado; cruzarlos convierte dos rankings en una decisión.
- **Concentración del ingreso:** qué porcentaje de la venta hacen los cinco platos más vendidos.

*La venta:*

- Ventas por día, hora y método de pago.
- **Ticket promedio por cuenta** y su evolución dentro del período.
- **Ventas por categoría de plato:** cuánto pesa cada familia del menú en el ingreso.
- **Comparativo contra el período anterior.** Toda cifra del panel se muestra contra el mismo período
  previo. Un número solo no dice si está bien o mal.

*La gente:*

- Comisiones por mesero: fijo + 5% de su venta neta cobrada, más propinas acumuladas y su saldo
  pendiente de liquidar.
- **Ranking de venta por mesero**, sobre **venta neta cobrada** — nunca sobre el total con propina.
- **Cierre del día por mesero:** quién cerró turno y quién no, cuánto debe entregar cada uno en efectivo y
  cuánto se le debe de propinas. Al no haber caja central, es la única contraparte que tiene el negocio
  frente al cierre que hace el mesero por su cuenta.
- **Horas efectivas contra horas programadas, por mesero.** Lo trabajado sale de sus sesiones; lo
  programado, del calendario. La diferencia entre las dos es el dato que ninguna de las dos da sola.
- **Venta por hora efectiva de mesero** (candidata). Cruza la venta neta cobrada contra las horas
  realmente trabajadas. Queda anotada, no comprometida para la v1.

*La operación:*

- **Tiempos de cocina.** Desde que la comanda entra hasta que la orden se termina: promedio y **% de
  comandas demoradas**, por plato y por franja horaria. Sale de marcas de tiempo que el KDS ya registra, y
  es el único lugar del sistema donde se mide la operación de cocina. También es lo que permite saber si
  el umbral de demora configurado tiene sentido.
- **Rotación de mesas.** Tiempo promedio entre la apertura de una cuenta y su cobro, por mesa y por franja
  horaria. En un salón, los turnos de mesa por noche pesan tanto como el margen del plato.
- **Anulaciones y faltantes.** Ranking de qué se anula y qué se marca **sin insumo**, con su motivo y su
  pérdida FIFO acumulada. Abre en detalle lo que en el estado de resultados es una sola línea.
  **Corta por plato y por mesero.** El corte por mesero no es un eje más: al desaparecer el cajero, el
  control pasó a ser por atribución, y la anulación es la única operación que puede hacer desaparecer
  dinero ya cobrado —se cobra en efectivo, se anula la unidad antes de cerrar la cuenta, y esa venta nunca
  existe, así que tampoco falta en el cierre de turno—. Con el corte solo por plato, una anulación por
  servicio se pierde entre las legítimas.

*El inventario:*

- Inventario: stock actual, insumos por agotarse, valor del inventario.
- **Insumos sin movimiento:** insumos con stock y sin consumo en el período, con su valor. Es plata parada
  y merma futura.

*Transversal:*

- **Filtro de período:** todo el panel responde al mismo rango de fechas.

## No alcance (qué explícitamente no incluye esta versión)

- **Impresión física de comandas.** Cocina trabaja únicamente con pantalla. No hay impresora térmica
  en cocina ni respaldo en papel.
- **Procesamiento de pagos.** El sistema no cobra: no se integra con Niubiz, Yape ni ninguna
  pasarela. El mesero opera el terminal externo por separado y registra el resultado a mano.
- **Rol de cajero y caja central.** No hay un usuario cajero, ni una estación de caja, ni un arqueo de
  caja con fondo y retiros. El cobro es una función del mesero sobre sus propias mesas.
- **Retiros de efectivo con aprobación de supervisor.** Al no existir una caja central con fondo, no hay
  registro de retiros ni flujo de aprobación por PIN de supervisor.
- **Emisión de comprobantes electrónicos.** No genera XML UBL, no firma con certificado digital, no
  envía a SUNAT ni a un OSE/PSE, y no gestiona resúmenes diarios, notas de crédito ni comunicaciones
  de baja. El comprobante se registra como dato; la emisión legal ocurriría por fuera del sistema.
  Decisión deliberada: la tesis del producto es atar ventas a costeo FIFO para ver rentabilidad, y el
  módulo de emisión eleva el estándar de calidad exigido —un error deja de ser un reporte equivocado y
  pasa a ser una contingencia tributaria— sin aportar nada a esa tesis.
- **Entrega del comprobante al cliente.** Ni impresión en caja ni envío por correo o mensajería.
- **Delivery, take-away y autopedido del comensal.** Solo consumo en salón, con pedido tomado por
  mesero. El cliente no interactúa con el sistema.
- **Reservas y gestión de turnos de mesa.**
- **Multi-sucursal.** Un solo local, un solo inventario.
- **App móvil por mesero.** El pedido se toma en estaciones compartidas, no en dispositivos
  personales.
- **Liquidación de planilla.** Los salarios se cargan como configuración de costos; no se calculan ni se
  pagan desde el sistema. (La liquidación de *propinas* sí está incluida.) **Matiz de la v1.5:** el sistema
  **sí registra las horas efectivas del mesero** a partir de su sesión, y las contrasta contra las
  programadas. Eso es control de horas para gestión, **no** planilla: nada de ese dato se convierte en un
  monto a pagar.
- **Identificación individual del personal de cocina.** Cocina no marca turno y su PIN es **uno solo para
  todos**: abre y cierra el servicio, pero no dice quién lo hizo. En consecuencia, **el descuento de
  inventario queda atribuido a nadie** — no se registra qué persona terminó una orden. Es una concesión
  deliberada a la velocidad con las manos ocupadas, y significa que auditar el consumo por persona no es
  posible en esta versión.
- **Deshacer una orden ya terminada.** No hay reverso del descuento de inventario. La corrección es
  anular, que deja la pérdida registrada en vez de borrar el consumo.
- **Costeo promedio ponderado o estándar.** El costeo es FIFO, y solo FIFO.
- **Conteo físico de inventario y ajuste por merma real.** La merma estructural sigue siendo un % flat
  estimado; no hay toma de inventario físico completo. **Revisión v1.1:** sí se incorpora el registro
  manual de mermas puntuales (insumo, cantidad, motivo) como ajuste de stock. Las pérdidas por anulación
  se registran aparte, y son un caso distinto y acotado.

## Criterios de éxito

Al ser un trabajo académico, todos los criterios se verifican sobre un **set de datos simulado** que
recorra el ciclo completo, no sobre operación real.

**Operación**

- Una comanda confirmada por el mesero aparece en el KDS en **≤ 3 segundos**.
- Tras un corte de red del KDS, al reconectar se muestra el **100%** de las comandas emitidas durante
  el corte, en el orden FIFO original. Cero comandas perdidas en una prueba de 20 comandas con corte
  forzado.
- Con el KDS fuera de servicio, la cocina accede a la misma cola desde una estación táctil y completa
  un servicio entero sin comandas perdidas.
- Un plato marcado como agotado (manual o automático) desaparece de **las 3 estaciones** en
  **≤ 5 segundos**. Un combo desaparece en cuanto se agota cualquiera de sus componentes.
- Registrar un pedido de 5 ítems toma **≤ 60 segundos** desde el login con PIN hasta la confirmación.
- Un ítem anulado **antes** de prepararse no descuenta inventario, no suma a la venta ni a la comisión.
  Un ítem anulado **después** de preparado descuenta inventario y aparece como pérdida por anulación.
- Marcar y desmarcar una unidad como lista **20 veces no genera ningún movimiento de inventario**. El
  stock cambia una sola vez, al terminar la orden.
- Cocina **no puede cerrar** con una orden pendiente: la acción está bloqueada hasta resolverla.
- **Sin servicio de cocina abierto** —tanto antes de iniciarlo como después de cerrarlo— una comanda con
  un plato que requiere cocina **se rechaza en el servidor**, incluso si la interfaz del mesero todavía no
  se actualizó. En los dos casos el mesero recibe el mismo aviso, al intentar enviar.
- Dos meseros abren cuenta en la misma mesa desde estaciones distintas: se crean **dos cuentas
  independientes**, cada una visible y cobrable **solo** por su dueño, sin que ninguna vea los ítems de la
  otra. La mesa figura ocupada y no se libera hasta que las dos estén cobradas.
- Un mesero con al menos una cuenta abierta **no puede cerrar turno**: la acción está bloqueada y el
  sistema le lista las cuentas que le faltan cobrar.
- La estación de cocina no abre ni cierra el servicio sin el **PIN de cocina**; ninguna otra acción de
  cocina lo pide. El cierre exige además una **confirmación explícita** antes de ejecutarse.
- Un pedido de 4 unidades del mismo plato se muestra en cocina como **4 filas independientes**, marcables
  una por una.

**Exactitud del dato (el núcleo del producto)**

- La suma de los estados de resultados **diarios** de un mes coincide **exactamente** con el estado de
  resultados **mensual**, y la suma de las semanas de ese mes también. Sin diferencias de redondeo
  acumuladas.
- El costo fijo imputado de un mes completo suma **el 100%** del costo fijo cargado para ese mes, ni más
  ni menos.

- El costo de insumos de una venta calculado por el sistema coincide **exactamente** con el cálculo
  FIFO manual, en una muestra de 20 ventas que atraviesen al menos 2 lotes con precios distintos y que
  incluya lotes con y sin crédito fiscal.
- Vender un combo descuenta exactamente los mismos insumos que vender sus componentes por separado.
- Modificar la receta o el precio de un plato **no altera** el margen de ninguna venta ya cerrada:
  los reportes de un periodo cerrado dan idéntico resultado antes y después del cambio.
- El **a entregar** del cierre de turno coincide con las **ventas en efectivo** del mesero
  (`efectivo recolectado − propinas en efectivo`): diferencia 0 en un turno simulado con al menos 5
  propinas en efectivo. Las propinas se muestran aparte y no se mezclan con la venta ni con lo entregado.
- La comisión mostrada por mesero es reproducible a mano: `fijo + 5% de su venta neta cobrada`,
  diferencia 0. Las propinas aparecen aparte y no se mezclan con la comisión.
- El margen de contribución diario y la utilidad mensual se reconstruyen a mano desde el set de datos
  simulado, diferencia 0 en ambos niveles.

**Demostración de extremo a extremo**

- Un escenario simulado que incluya varias mesas con rondas múltiples, una anulación antes de
  preparar, una anulación después de preparar, una venta de combo, un pago dividido con propina y un
  cierre de turno, recorre el ciclo completo **sin ninguna intervención manual fuera del sistema**.
- El administrador obtiene el margen por plato **sin ninguna planilla auxiliar** ni cálculo manual.

## Casos borde a contemplar

**Stock insuficiente (resuelto — así se comporta el sistema)**

- Si al confirmar un pedido el stock de un insumo no alcanza, **la venta se permite igual**: no se
  frena una venta real por un desfase de carga. El stock queda negativo y la venta se marca como
  incidencia en la bandeja del administrador.
- Para costear ese consumo sin lote disponible, FIFO usa el **precio del último lote conocido** de ese
  insumo, respetando si ese lote tenía crédito fiscal o no. Si el insumo nunca tuvo compras
  registradas, el margen del plato queda señalado como no costeable hasta que se registre una compra.
- Debería ser raro: el marcado automático de agotado lo previene casi siempre. Si aparece seguido, es
  señal de recetas mal cargadas o compras registradas tarde.

**Concurrencia (3 estaciones compartidas)**

- **Dos meseros sobre la misma mesa (resuelto — así se comporta el sistema).** No hay conflicto que
  resolver, porque no comparten nada: cada uno abre su propia cuenta sobre la mesa y opera solo la suya.
  "Ocupada" informa, no bloquea.
- **Cobro sobre la sesión de otro (resuelto — así se comporta el sistema).** El sistema no ofrece ninguna
  forma de cobrar en nombre de otro mesero ni de abrir su cuenta: se cobra lo propio, desde la propia
  sesión, y punto. Lo que el sistema no puede evitar es que un mesero le preste el PIN a otro; eso queda
  fuera del modelo y se maneja entre ellos (ver *riesgo* más abajo).
- Un plato se agota entre que el mesero lo selecciona y confirma el pedido.

**Inventario y costeo**

- **Compra registrada con fecha retroactiva (resuelto — así se comporta el sistema).** El lote entra
  **al final de la cola de consumo**, no al principio: los lotes se consumen en el orden en que se
  registraron, y la fecha de compra es un dato del negocio que **no ordena nada**. Ningún consumo ya
  escrito se altera. Es lo que permite que el costo FIFO del sistema se pueda verificar a mano sobre el
  estado final del libro —criterio de éxito de este documento— en vez de exigir reconstruir la historia.
  El aviso al registrarla dice exactamente eso, para que nadie suponga lo contrario.
- Corrección de una compra ya consumida por ventas cerradas: las ventas conservan su costo congelado,
  de modo que el ajuste no puede propagarse hacia atrás — definir dónde se refleja la diferencia.
- Corrección de la marca de crédito fiscal de una compra ya consumida: mismo problema, distinto
  origen.
- Cambio de precio de un plato con cuentas abiertas en el salón, y su efecto sobre el reparto de
  precio de los combos que lo contienen.
- **Baja de un plato que sostiene un combo (resuelto — así se comporta el sistema).** La baja **se
  bloquea** mientras el plato forme parte de un combo activo. Como el combo no tiene receta propia y toma
  la del plato en vivo, darlo de baja dejaría al combo sin con qué costearse ni qué descontar. Primero se
  saca el plato del combo, o se da de baja el combo.

**Pedido y cocina**

- **Anulación durante un corte del KDS (resuelto — así se comporta el sistema).** Al reconectar, la
  comanda se muestra **ya anulada**, no como pendiente. La cola se pone al día con el estado final de cada
  comanda, no con la secuencia de lo que pasó mientras estaba fuera de línea.
- **Comanda sin marcar al cierre (resuelto — así se comporta el sistema).** No puede pasar: cocina **no
  puede cerrar** con órdenes pendientes. Cada orden se termina o sus unidades se marcan como sin insumo.
- **Unidad marcada lista por error (resuelto).** Se deshace y vuelve a pendiente. Como el inventario se
  descuenta al *terminar la orden* y no al marcar cada unidad, deshacer no tiene ninguna consecuencia
  contable.
- **Orden terminada por error.** No hay deshacer después de terminar. La corrección es anular, que
  registra la pérdida por anulación con su costo.
- **Cambio de mesa y unión de mesas (resuelto — así se comporta el sistema).** Eran dos situaciones
  metidas en una línea y se resuelven distinto: el cliente que se cambia **mueve** su cuenta, y dos mesas
  que se juntan **fusionan** dos cuentas del mismo mesero. Las reglas viven en *Toma de pedidos* y su
  efecto sobre cocina en *Cocina*; no se repiten acá.
- Comanda enviada en el instante exacto en que cocina cierra — tiene que rechazarse, no quedar colgada.

**Cobro y cierre**

- Pago dividido cuya suma no llega al total de la cuenta.
- **Propina en un pago dividido (resuelto — así se comporta el sistema).** Se acumula **una sola vez por
  venta**, no una por comensal, y va al mesero **dueño de la cuenta**. No hay mesero asignado a la mesa:
  la cuenta tiene un solo dueño de punta a punta, así que no hay nada que desambiguar.
- Monto pagado por encima de la cuenta que **no** era propina, sino un error de digitación del mesero.
- **Cierre de turno con cuentas abiertas (resuelto — así se comporta el sistema).** No se puede: el mesero
  cobra todas sus cuentas o no cierra. Una cuenta con cobro parcial cuenta como abierta.
- El terminal POS externo aprueba el pago pero el mesero no lo registra (o lo registra dos veces).
- **Mesero que se va sin cerrar turno (resuelto — así se comporta el sistema).** El turno queda abierto y
  **no bloquea a nadie**: al día siguiente el mesero entra con normalidad y se le abre uno nuevo. El
  anterior cae en la **bandeja de turnos sin cerrar del administrador**, que lo cierra y **puede corregir
  la hora de salida** a la que el mesero efectivamente se fue; el sistema propone la de su última
  actividad. Queda registrado quién lo cerró, qué hora proponía el sistema y el motivo, y su consolidación
  se marca como **no firmada por el mesero**, porque *a entregar* es una cifra que normalmente firma él.
- **Una cuenta cobrada por el mesero equivocado (resuelto — así se comporta el sistema).** No puede pasar
  por la interfaz: un mesero no ve ni puede abrir la cuenta de otro. La única vía es el PIN prestado, que
  es un problema humano y está registrado como riesgo, no como funcionalidad.

## Supuestos y riesgos abiertos

- **Trabajo académico.** No hay despliegue en un local real ni día de piloto. Todo criterio se valida
  con datos simulados. Es también lo que hace aceptable dejar la emisión electrónica fuera de alcance.
- **Contexto Perú.** Boleta/factura, IGV, Niubiz y Yape sitúan el producto en Perú. IGV del 18% y
  moneda única (PEN).
- **Régimen tributario con crédito fiscal.** El costeo neto de las compras con factura supone que el
  negocio puede recuperar el IGV de compras. En un régimen sin crédito fiscal, todas las compras
  deberían costearse brutas.
- **El mesero cobra sus propias mesas.** No hay caja central ni cajero. Cada mesero recolecta el
  efectivo de sus mesas y lo entrega en su cierre de turno; supone confianza operativa y control por
  atribución, no por separación de funciones entre quien vende y quien cobra.
- **La comisión del 5% se calcula sobre la venta neta**, no sobre el total cobrado. Requiere que el
  sistema separe neto e IGV en cada venta, no solo al final del periodo.
- **Riesgo — doble digitación del comprobante.** Al no emitir, en un uso real cada venta debería
  transcribirse a un emisor externo. Es trabajo manual recurrente y una fuente de descuadre entre lo
  que registra el POS y lo que se declara.
- **Riesgo — descuadre con el terminal externo.** Al no haber integración, el monto cobrado por el POS
  del proveedor y el registrado en el sistema pueden diferir. El sistema no reconcilia pagos con
  tarjeta o Yape contra el terminal.
- **Riesgo — sin separación de funciones en el cobro.** Al concentrar venta y cobro en el mesero se
  pierde el control cruzado que daba un cajero aparte; la trazabilidad se apoya solo en el PIN en sesión.
  **El control por atribución cubre la venta y ahora también la anulación**, que es la operación por la
  que el dinero cobrado puede no llegar a ser una venta: toda pérdida por anulación registra su mesero y
  su motivo, y el ranking corta por persona. Lo que sigue sin cubrir es el caso de abajo — el PIN
  prestado—, porque ahí la atribución funciona y apunta a la persona equivocada.
- **Riesgo — el PIN prestado.** El sistema garantiza que una venta se atribuye a la sesión que la hizo, no
  que esa sesión sea la persona que dice ser. Si un mesero le presta el PIN a otro, la comisión, la propina
  y el efectivo quedan mal atribuidos y el sistema no tiene cómo notarlo. Es la única grieta que queda en
  la atribución, y es humana, no de producto.
- **Riesgo — el PIN de cocina es compartido.** Al ser uno solo para todos, cualquiera que lo conozca puede
  abrir o cerrar el servicio, y cerrar cocina corta el envío de comida de todo el salón. El sistema no
  puede decir quién lo hizo. Es el precio de no hacer fichar a la cocina.
- **Datos personales del cliente: se minimizan y no se explotan.** El comprobante es el único lugar del
  sistema que guarda datos de un tercero — DNI, nombre y dirección en boleta; RUC, razón social y
  dirección fiscal en factura. **Su propósito es uno solo: sostener una emisión electrónica futura**, que
  esta versión no hace. De ahí salen tres reglas: en boleta los tres campos son **opcionales y no se piden
  por defecto** —no recolectar es el camino normal—; **nadie lee los datos del receptor de un comprobante
  que no cobró**; y no aparecen en ningún reporte, exportación ni evento en vivo.
- **Riesgo — la retención de esos datos no está resuelta.** El sistema los guarda mientras exista la
  venta, que es para siempre por ADR-0004. Para un banco de datos con DNI y domicilio de personas
  naturales, el **contexto Perú** que este PRD ya declara trae la Ley 29733 de Protección de Datos
  Personales, con obligaciones de finalidad, proporcionalidad y seguridad. **Queda fuera de alcance para
  un trabajo académico sin despliegue real**, con el mismo fundamento que la emisión electrónica — pero
  declarado, no omitido. Si este sistema saliera a producción, es lo primero a resolver junto con la
  emisión y el segundo factor del administrador, y es el único de los tres que además obligaría a migrar
  datos ya recolectados.
- **Idioma de la interfaz: español.** Todo texto visible al usuario va en español, incluidos los estados
  (*advertencia*, *bien*, *agotado*, *demorada*). Los nombres `warning` / `good` que aparecen en
  `DESIGN.md` son **nombres de color del design system**, no texto de pantalla.
- **Riesgo — la merma es un supuesto, no una medición.** Un % flat sobre el costo de insumos no
  distingue una merma real de un faltante por robo o error de receta. La utilidad es *estimada*, y
  debe presentarse como tal. Las pérdidas por anulación sí son medidas, y por eso van en línea aparte.
- **Riesgo — el KDS sigue siendo el punto débil, aunque ya no único.** La consulta desde estación
  cubre la rotura del dispositivo, pero si el local se queda sin energía o sin red local, no hay
  respaldo en papel y la cocina queda ciega.
- **Riesgo — dependencia de la red local.** Estaciones y KDS deben verse entre sí en todo momento; la
  calidad del wifi del local es un requisito no funcional que el producto no controla.
- **Riesgo — el dato depende de la disciplina de carga.** Si el administrador no registra las compras
  al día, no marca bien el crédito fiscal, o las recetas no son exactas, el costo FIFO y todo el
  dashboard pierden validez. El sistema no puede detectar una receta mal cargada.
- **Supuesto — el mesero transcribe un pedido ya anotado en papel.** El sistema no elimina el papel del
  salón, solo el de cocina.
- **Riesgo — alcance grande para una v1.** Seis módulos interdependientes en un solo entregable, sin
  etapas intermedias. Si el tiempo se acorta, el corte natural es dejar comisiones, cierre de turno y
  estado de resultados para después: pedido → KDS → cobro → inventario → margen por plato ya sostiene la
  tesis del producto.

## Historia de cambios

El registro de cómo el producto llegó a ser lo que es —siete versiones, con las reglas que se
reemplazaron y el motivo— vive en **`CHANGELOG.md`**.

Está afuera de este documento a propósito: el PRD describe **el sistema de hoy**, y mezclarlo con reglas
que ya no rigen obliga a leer un quinto del documento para descubrir cuáles todavía valen.
