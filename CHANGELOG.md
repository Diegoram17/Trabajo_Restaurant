---
title: "POS para Restaurantes — Registro de cambios"
---

# Registro de cambios

> Historia de las decisiones de producto del POS, de la más reciente a la más antigua. Vive fuera del
> `PRD.md` a propósito: el PRD dice **cómo es el sistema hoy**, y este documento dice **cómo llegó a
> serlo**. Varias entradas describen reglas que fueron reemplazadas después — están marcadas, y se
> conservan porque el motivo por el que algo cambió suele ser más útil que el cambio en sí.
>
> El **porqué técnico** de cada decisión vive en `adrs/`; acá está el porqué de producto.

## v1.9 — Quién entra a qué

El último agujero que quedaba del diseño original: la autenticación estaba decidida **solo para la
estación del mesero**, y todo lo demás había crecido alrededor del hueco. El porqué técnico, en
`adrs/0031`.

- **Tres llaves distintas, porque protegen cosas distintas.** El **equipo** —cada pantalla del local se
  enrola una vez y con eso recibe las actualizaciones en vivo, sin identificar a nadie—; la **persona**
  —el mesero con su PIN, el administrador con usuario y contraseña—; y la **llave del servicio** —el PIN
  de cocina, que abre y cierra la ventana y sigue sin decir quién lo usó—. Ninguna hace el trabajo de otra.
- **El administrador no entra con PIN.** El PIN corto existe porque el mesero está de pie, apurado y con
  la pantalla a la vista del salón. El administrador trabaja sentado y por sesiones largas, así que
  heredarlo habría sido copiar la forma sin el motivo — y `/admin` gobierna la estructura de costos y el
  calendario que divide todo el estado de resultados.
- **El PIN de cocina pasa a 6 dígitos.** Se tipea dos veces por día y protege la acción que corta la venta
  de comida de todo el salón: la fricción extra es nula y adivinarlo es cien veces más difícil.
- **El bloqueo por intentos es de la pantalla, no de la persona.** Una estación bajo ataque no deja sin
  trabajar a las otras dos, y **nunca alcanza al marcado de cocina**: dejar a un cocinero sin poder marcar
  sería peor que el riesgo que evita.
- **El sistema ya sabe arrancar.** Antes la cadena se mordía la cola —vender comida exigía el PIN de
  cocina, que lo define el administrador, que no tenía cómo entrar—. Ahora la instalación crea **un
  administrador y nada más**, con contraseña de un solo uso que hay que rotar, y la *revisión de
  pendientes* avisa que faltan el PIN de cocina y los dispositivos.

## v1.8 — Lo que la revisión adversarial destapó

No salió de una idea de producto sino de una **revisión adversarial completa** contra los 25 ADRs, que
encontró tres reglas que el PRD daba por dichas y no estaban. Las tres son de producto, así que suben acá;
el porqué técnico de cada una vive en `adrs/0026` a `adrs/0030`.

- **El día del sistema es el día operativo y arranca a las 05:00.** Nunca había estado definido, y de esa
  palabra dependían el turno, el servicio de cocina, el calendario de apertura y cada cifra del dashboard.
  Con el corte a medianoche, el cierre de un sábado a la 01:00 caía en domingo: facturaba contra un día que
  el calendario podía declarar cerrado, y el sábado perdía la recaudación de su propio cierre. El total del
  mes seguía cerrando, así que el error no se delataba por ningún lado. De paso quedó claro que *un
  servicio por día* y *un turno por jornada* describen la operación normal, **no un límite**.
- **Las bebidas no descontaban inventario. Nunca.** El inventario se escribía solo cuando cocina terminaba
  una orden, y lo que no requiere cocina no pasa por cocina: una gaseosa con receta no generaba un solo
  movimiento, su stock no bajaba y el dashboard la reportaba como **margen puro**. Ahora el ítem sin cocina
  descuenta **al enviarse**, que es cuando la botella sale físicamente de la heladera. Se descartó
  descontar al cobrar: el agotado automático habría llegado siempre tarde, justo en la categoría que más se
  acaba en pleno servicio.
- **Editar un combo cambiaba los reportes históricos.** *Platos más vendidos* y *platos más rentables*
  obligaban a leer la composición del combo **viva**, así que cambiarla movía el pasado — lo contrario de lo
  que este producto promete. Ahora el combo se descompone en sus platos al enviarse y la venta guarda una
  línea por componente, con su precio ya repartido. El combo sigue existiendo en la carta y en el
  comprobante; deja de existir como fila de venta.
- **La compra retroactiva dejó de reordenar el pasado.** Los lotes se consumen en el **orden en que se
  registraron**, y la fecha de compra pasó a ser un dato del negocio que no ordena nada. Con el orden por
  fecha, registrar una compra olvidada dejaba el libro en un estado que la propia regla ya no reproducía, y
  eso rompía el criterio de éxito de verificar el costo FIFO a mano.

## v1.7 — Los dos casos borde que faltaban

Con esto **no queda ningún caso borde abierto** en el PRD. Ya reflejado en las secciones correspondientes del `PRD.md`:

- **El turno que nadie cierra.** El turno abierto **no bloquea** al mesero: al día siguiente entra normal y
  se le abre uno nuevo. El anterior cae en una **bandeja del administrador**, que lo cierra y **puede
  corregir la hora de salida**; el sistema propone la de la última actividad. Se descartó el cierre
  automático por corte diario: generaba un *a entregar* **que nadie firmó**, y eso no cierra el caso, lo
  tapa con un número sin dueño.
- **Toda corrección de hora deja traza:** quién cerró, qué hora proponía el sistema y por qué se cambió.
  Una hora editable sin traza es un dato que cualquiera escribe y nadie audita.
- **Cambio de mesa y unión de mesas eran dos casos, no uno.** Mover una cuenta a otra mesa se puede
  siempre; fusionar dos cuentas solo entre las **del mismo mesero**. Se descartó la fusión entre meseros
  distintos porque reintroducía la transferencia de cuentas que la v1.4 eliminó, y con ella la pregunta de
  a quién le queda la comisión.
- **Cocina sí participa en el cambio de mesa**, al contrario de lo que el PRD decía antes. El KDS muestra
  la mesa en grande, así que re-etiqueta las comandas pendientes y marca el cambio. Sin eso el cocinero
  saca el plato a la mesa equivocada.

## v1.6 — El dashboard: tres períodos que reconcilian

Al detallar qué mira el administrador en el panel, el resultado en dos niveles se reemplazó por un estado
de resultados con período seleccionable, y se sumaron análisis que salen de datos que el sistema ya
captura. **Nota:** un punto de esta lista quedó **superado por `ADR-0021`** —el origen de los días
operativos—; está marcado abajo. Ya reflejado en las secciones correspondientes del `PRD.md`:

- **Estado de resultados por día, semana y mes**, con el mismo cálculo. Reemplaza al "resultado en dos
  niveles" de la v1.1, que solo daba margen de contribución diario y utilidad mensual.
- **Los costos fijos ahora sí se imputan a períodos cortos**, revirtiendo la decisión original de no
  repartirlos. Pero **no por calendario**: se dividen entre los **días operativos** del mes. Dividir entre
  4 semanas hace que las semanas de un mes sumen 8,7% más que el costo real, y las vistas dejan de
  coincidir entre sí. Con día operativo, la suma de los días da la semana y la suma de las semanas da el
  mes, exacto.
- **El margen de contribución queda como línea propia y visible**, arriba de la utilidad: es la única de
  las dos sin ninguna imputación adentro.
- ~~**Los días operativos salen del calendario de horarios**, que así deja de ser solo planificación de
  personal y pasa a alimentar el resultado.~~ **Superado por `ADR-0021`:** salen de un
  **`CalendarioApertura` propio**. Que el local abra es un hecho del negocio, no un subproducto de haber
  cargado los turnos del personal — con el origen anterior, un mes sin horarios cargados dejaba al estado
  de resultados **sin divisor**.
- **Análisis nuevos, todos sobre datos ya capturados:** ticket promedio, ventas por categoría, ranking por
  mesero, comparativo contra período anterior, matriz de ingeniería de menú, tiempos de cocina, rotación
  de mesas, anulaciones y faltantes en detalle, concentración del ingreso, e insumos sin movimiento.
- **Dos criterios de éxito nuevos**, ambos de reconciliación: los días suman el mes, y el costo fijo
  imputado suma el 100% del mes.
- **Descartados en esta pasada:** mapa de calor día × hora, mix de método de pago y boleta contra factura
  como vistas propias (la venta por hora y por método ya está cubierta), y el libro de transacciones como
  vista nueva — la auditoría de ventas de la v1.1 se mantiene tal como está.

## v1.5 — El rol del administrador: escribir y leer son dos cosas

Al detallar las historias del administrador se separó explícitamente lo que **escribe** de lo que **lee**,
y aparecieron cuatro funciones que el PRD no tenía. Ya reflejadas en las secciones correspondientes del `PRD.md`:

- **Gestión y dashboard quedan separados por propósito.** Gestión carga datos; el dashboard los analiza.
  Ninguna cifra analítica vive en gestión.
- **Costo directo a la vista al fijar el precio**, con margen aplicable para determinarlo. Solo insumos.
  El margen efectivo sigue siendo del dashboard, y el documento ahora dice que son dos números distintos.
- **Calendario de horarios**, con horas programadas por persona y por semana. Es un módulo nuevo sobre un
  alcance que el propio PRD ya marca como grande — queda dicho.
- **El mesero ficha, y el turno es el fichaje.** El turno arranca al marcar ingreso o con su **primer
  login del día**, y cierra con el cierre de turno; ese intervalo son sus **horas efectivas**. El respaldo
  es el login y no el primer pedido: con el pedido como disparador, un mesero que entra y no recibe
  ninguna mesa no tendría ningún turno registrado. Corrige la primera
  redacción del calendario, que daba por hecho que el sistema no registraba horas. El dashboard contrasta
  **efectivas contra programadas**. Cocina sigue sin fichar, y los sueldos siguen fuera del sistema: las
  horas informan, no liquidan.
- **Caso borde nuevo y abierto:** mesero que cobra todo y se va **sin cerrar turno**, con las horas
  corriendo.
- **El PIN de cocina pasa a tener dueño: el administrador.** La v1.4 lo creó sin decir quién lo define ni
  quién lo rota.
- **Parámetros del sistema editables** en un solo lugar: IGV, comisión, merma estimada y umbral de comanda
  demorada. Antes eran constantes sin dueño.
- **Sin huecos al salir de gestión:** validación en el formulario más una revisión de pendientes.
- **El combo se confirma como estaba, con el vínculo explícito.** Se evaluó tratarlo como producto
  independiente con receta copiada y se **descartó**: una copia se desactualiza en silencio cuando cambia
  la receta del plato. El combo mantiene el vínculo **vivo** con sus platos, y ahora el documento lo dice
  en vez de darlo por sobreentendido. Se agregan dos consecuencias que faltaban: **requiere cocina** se
  deriva de sus componentes, y en el KDS entra como las unidades de esos platos.
- **Un caso borde más resuelto:** la baja de un plato que sostiene un combo **se bloquea**. Alinea el PRD
  con lo que `DESIGN.md` ya daba por decidido.

## v1.4 — La cuenta es del mesero, la cocina abre con PIN

Al detallar las historias de usuario del mesero aparecieron reglas que el PRD tenía mal, a medias o en
contradicción. Ya reflejadas en las secciones correspondientes del `PRD.md`:

- **Cambio de modelo: la cuenta deja de ser de la mesa y pasa a ser del mesero.** Una mesa puede tener
  varias cuentas abiertas a la vez, una por mesero, independientes entre sí. Es el cambio de fondo de esta
  versión y toca pedido, cobro, liberación de mesa y cierre de turno.
- **"Ocupada" informa, no bloquea.** Se retira la restricción de que el mesero solo podía abrir mesas
  libres o propias. Cualquiera puede iniciar un pedido en cualquier mesa; si ya hay cuenta de otro, se abre
  una nueva y separada. **No hay transferencia de mesas ni de cuentas** entre meseros.
- **La mesa vuelve a libre recién cuando no le queda ninguna cuenta abierta**, no al cobrar la primera.
- **Las mesas se distinguen por etiqueta y color.** Reemplaza al marcado por forma.
- **Sin cocina abierta no se envía comida, y la regla es simétrica.** Se retira la asimetría de la v1.3,
  que permitía enviar con el servicio sin iniciar y solo bloqueaba con cocina cerrada. El argumento de
  entonces —"un sin iniciar es un olvido"— no cambia el hecho de que nadie está mirando la pantalla: el
  plato no se cocina igual. Lo que **no** requiere cocina se sigue vendiendo siempre, y se puede abrir mesa
  nueva.
- **El mesero no tiene indicador de estado de cocina.** Se retira de su barra superior. El bloqueo se le
  informa **al intentar enviar**, con las acciones que sí le quedan disponibles.
- **Cocina sí tiene PIN, y es uno solo para todos.** Corrige la v1.3, que la dejaba sin identificación
  alguna. El PIN abre y cierra el servicio; no distingue personas, no ficha turno y **no se vuelve a pedir
  para marcar**. La atribución del consumo a una persona sigue fuera de alcance.
- **No se puede cerrar turno con cuentas abiertas.** El mesero cobra todas las suyas o no cierra. Como
  nadie más puede cobrarlas, si no las cierra él no las cierra nadie.
- **Cobrar es solo lo propio y desde la propia sesión.** No existe abrir la cuenta de otro, cobrar en su
  nombre ni reasignar un cobro. El PIN prestado queda registrado como riesgo, no como funcionalidad.
- **Estados nombrados en español.** El contraste de la división de cuenta se muestra como *advertencia* /
  *bien*, no con etiquetas de color.
- **Un solo servicio de cocina por día.** Se retira el esquema de la v1.3 de cerrar entre almuerzo y cena:
  la cocina abre al abrir el negocio y cierra al cerrarlo. Se agrega una **reapertura excepcional** el
  mismo día, para que un cierre por error no mate la venta de comida hasta el día siguiente.
- **Cerrar cocina exige confirmación explícita y el PIN otra vez.** Es la acción que corta la venta de
  comida de todo el salón; su fricción tiene que ser proporcional a eso.
- **Una fila por unidad, siempre.** No es un caso de "dos unidades del mismo plato": cada unidad pedida es
  una fila, sin agrupar.

Cinco casos borde salieron de la lista de pendientes y pasaron a *resueltos*: dos meseros sobre la misma
mesa, cierre de turno con cuentas abiertas, cobro sobre la sesión de otro, anulación durante un corte del
KDS, y una cuenta cobrada por el mesero equivocado. El caso de mesas que se unen o clientes que se cambian
de mesa **sigue abierto**, y queda del lado del salón: cocina no participa.

## v1.3 — El flujo del cocinero

Al definir la operación de cocina se decidió qué hace exactamente el cocinero, que hasta acá era una sola
línea ("marcar una comanda como preparada"). **Nota:** tres puntos de esta lista quedaron **superados por
la v1.4** —"cocina no se identifica", el envío permitido con el servicio sin iniciar, y los varios
servicios por día—; se conservan como registro histórico. El resto sigue vigente. Ya reflejado en las
secciones correspondientes del `PRD.md`:

- **Cocina son dos pantallas, no una.** Una de pared que solo se lee, y una estación táctil que es la
  única que escribe. La separación es física: lo que se lee a dos metros no se toca con precisión.
- **Cocina no se identifica.** Sin PIN y sin turno: la estación se abre al empezar el servicio y desde ahí
  cualquier cocinero marca. Se retira la idea de que el personal de cocina fiche.
- **Marcado por unidad, no por comanda ni por línea**, con **deshacer**. Dos unidades del mismo plato son
  dos filas independientes.
- **Segundo paso: terminar la orden**, disponible cuando todas sus unidades están resueltas. Es el paso
  irreversible y **el que descuenta inventario**. Marcar y desmarcar unidades no toca el stock.
- **Unidad sin insumo** con motivo, que avisa al mesero y va a la bandeja de incidencias.
- **Historial de órdenes terminadas** consultable por cocina, de solo lectura.
- **Comanda demorada** derivada del tiempo, con umbral configurable. Nadie la marca.
- **Inicio y cierre de cocina, con varios servicios por día.** Cerrar inhabilita el envío de comida desde
  el salón, y **no se puede cerrar con órdenes pendientes**.
- **Marca de "requiere cocina" por plato**: con la cocina cerrada se sigue vendiendo lo que no la
  necesita, y se puede abrir mesa nueva.
- **El cobro no alimenta el inventario.** Corrige la línea del flujo de cobro que decía lo contrario.

**Reconciliación con el prototipo validado del mesero.** Al revisar el PRD contra
`prototypes/estacion-mesero.html` aparecieron cuatro reglas que ya funcionaban en el prototipo y que este
documento no registraba. Se incorporaron a *Cobro (mesero)*:

- **Datos del receptor por tipo de comprobante**, con obligatoriedad distinta: boleta los acepta opcionales,
  **factura los exige**. Corrige una contradicción — el PRD decía "receptor opcional" para los dos.
- **El comprobante se graba antes del pago** y sin eso el cobro no se puede confirmar.
- **En efectivo se ingresa el monto recibido y el sistema calcula el vuelto**; un monto insuficiente no se
  puede confirmar.
- **Atajos de propina** (10%, 15%) además del monto libre, ninguno preseleccionado.

## v1.2 — Fusión de cobro en el rol del mesero

Al prototipar la operación de salón se decidió **eliminar el rol de cajero** y que el mesero asuma el
cobro de sus propias mesas. Ya reflejado en las secciones correspondientes del `PRD.md`:

- **Se elimina el usuario cajero y la caja central.** No hay estación de caja ni login de cajero; el
  cobro es una función del mesero, atribuida a su PIN en sesión.
- **Anulación de ítem por cantidad, con el ítem tachado.** El modal permite elegir cuántas unidades de una
  línea anular (con motivo) y el ítem anulado permanece tachado en la cuenta en vez de desaparecer.
- **Cobro integrado en el flujo del mesero.** Botón **Cobrar mesa** en la pantalla del pedido, que abre
  la cuenta con detalle de consumo, comprobante (boleta/factura con sus datos), método de pago, propina,
  vuelto y división de cuenta —completa o dividida— con su confirmación explícita.
- **Mesas por estado libre / ocupada**, con marcado distintivo de las mesas que tomó el mesero en
  sesión. Se retira el estado "por cobrar" propio de la vista de caja.
- **Cierre de caja → Cierre de turno del mesero.** Se retira el arqueo con fondo, efectivo esperado vs.
  contado y diferencia. En su lugar, un resumen del turno: ventas en efectivo y POS, propinas en efectivo
  y POS (cada línea expandible por mesa), y un **a entregar = efectivo recolectado − propinas en
  efectivo** (el mesero entrega sus ventas en efectivo y se queda con sus propinas en efectivo).
- **Se retiran los retiros de efectivo con aprobación de supervisor**, que dependían de una caja central
  con fondo.
- **Cobros realizados del turno** con detalle de consumo por mesa en pop-up. Se retira la anulación de
  cobros desde esta vista.

## v1.1 — Refinamientos de caja e inventario

Refinamientos surgidos al prototipar los módulos de cobro e inventario. **Nota:** los puntos de caja de
esta lista quedaron **superados por la v1.2** (login de cajero, confirmación de pago, retiros y arqueo de
caja); se conservan como registro histórico. Siguen vigentes:

- **Confirmación explícita del pago** (resumen + confirmación) antes de registrar cualquier cobro —
  ahora a cargo del mesero.
- **Inventario — registro de compras** (insumo predefinido, cantidad, precio, crédito fiscal) que suma al
  stock, y **registro de mermas** que lo reduce. Ajusta la exclusión de mermas puntuales del alcance
  original.
- **Módulo de administración / auditoría (dashboard).** El dashboard de gestión —solo administrador— es la
  vista principal: resultado en dos niveles (margen de contribución diario y utilidad mensual), platos más
  vendidos y más rentables (con costo FIFO), comisiones y propinas por mesero, ventas por día y por método,
  e inventario. Como grupo secundario, una capa de **auditoría de ventas**: transacciones (neto e IGV
  separados), anulaciones con pérdida FIFO, sesiones y gestión de usuarios y PINs. Moneda en soles (S/),
  IGV 18%.
