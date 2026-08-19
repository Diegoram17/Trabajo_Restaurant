# ADR 0026: El ítem que no requiere cocina consume inventario al enviarse

## Estado

Aceptado — cierra el hallazgo #1 de `REVISION-ADVERSARIAL.md`. Extiende **ADR-0006** (refinado por
ADR-0016) al único caso que su regla no alcanzaba, y precisa **ADR-0019** en el punto del pedido mixto.

## Contexto

Dos decisiones correctas por separado se cancelaban entre sí:

- **ADR-0006, refinado por ADR-0016:** el movimiento de inventario se escribe **solo** cuando cocina marca
  la orden como `terminada`. Es el único punto de escritura del libro.
- **ADR-0019 y el PRD:** los ítems con `requiere_cocina = false` se venden siempre —con la cocina abierta
  o cerrada— y **no pasan por cocina**.

De la intersección salía que **una bebida con receta no generaba ningún `MovimientoInventario`, nunca**.
Su stock no bajaba, su agotado automático no disparaba jamás, y su `costo_fifo_snapshot` quedaba vacío,
así que el dashboard reportaba **toda bebida como margen puro**.

No es un caso marginal. En un restaurante de salón las bebidas son una porción grande del margen, y el
PRD construye explícitamente el camino de venderlas solas: *"una mesa que solo toma bebida es una venta
legítima"*. El error además falla **hacia arriba** —el negocio se ve más rentable de lo que es—, que es
la dirección en la que nada lo denuncia.

Y no había escape por el lado de no darle receta a la bebida: un plato sin receta queda **no costeable** y
*"no entra en platos más rentables"*, así que se cae igual del reporte que el producto existe para
producir.

Había además una segunda punta, operativa y más grave. Una comanda de solo bebidas se acepta (ADR-0019) y
nacía `pendiente`. Nada decía que el KDS filtrara por `requiere_cocina`, así que:

- si el KDS no la mostraba, nadie podía terminarla y quedaba `pendiente` para siempre — y como *"no se
  puede cerrar con órdenes pendientes"* es un bloqueo duro (ADR-0016), **la cocina no podía cerrar nunca**;
- si el KDS la mostraba, cocina marcaba unidad por unidad bebidas que nunca preparó.

Ninguna de las dos ramas estaba elegida, y las dos estaban rotas.

## Decisión

**El ítem que no requiere cocina consume inventario al enviarse, y lo hace por el camino de escritura que
ya existe.**

```
Comanda sin ítems que requieran cocina
  nace estado = terminada
  terminada_en = creada_en
  sus ItemComanda nacen estado = listo
  → escribe sus movimientos FIFO en la misma transacción de creación

Pedido mixto  [lomo, gaseosa, gaseosa]   con cocina abierta
  → Comanda A  (sin cocina)  nace terminada, escribe inventario
  → Comanda B  (cocina)      nace pendiente, va al KDS
  Una sola acción del mesero. Un solo resultado.
```

Tres puntos que la definen:

1. **No hay un camino de escritura nuevo.** ADR-0006 queda intacto al pie de la letra: el inventario se
   escribe cuando la comanda pasa a `terminada`. Lo único que cambia es que esta llega ahí sola, en el
   mismo instante en que nace, en vez de pasar por cocina. Es una decisión sobre la **máquina de estados**,
   no sobre el momento del consumo.

2. **El pedido mixto se parte en dos comandas, del lado del servidor.** El mesero ejecuta una acción y ve
   un resultado. La división es interna y no se le muestra como dos envíos.

3. **El KDS muestra solo comandas de cocina, y eso no requiere ningún filtro nuevo.** Una comanda nacida
   `terminada` nunca está `pendiente`, así que ya queda fuera de la cola activa por la regla que el KDS
   aplica hoy.

El momento elegido es el físicamente correcto: **la botella sale de la heladera cuando el mesero la
agarra**, no cuando el cliente paga. Es el mismo principio de ADR-0006 —el insumo se va cuando se consume,
no cuando se cobra— aplicado al otro momento físico que existe en este sistema.

## Alternativas consideradas

- **Consumir al cobrar.** Viable, y con una ventaja real: anular antes de cobrar no habría consumido nada,
  así que no aparecería ninguna pérdida por anulación falsa, y venta y consumo reconciliarían por
  construcción para esta clase de ítem. No se eligió porque es **exactamente lo que ADR-0006 rechazó por
  escrito**: *"si el stock baja recién al cobrar, diez mesas pueden pedir el mismo plato durante el
  servicio y el sistema seguirá reportando stock disponible… el marcado automático de agotado llegaría
  siempre tarde"*. Ese argumento no se debilita en las bebidas: se agrava, porque la bebida es justo lo que
  se acaba en pleno servicio. Y agregaba un **segundo momento de consumo** al sistema, con dos reglas donde
  hoy hay una.

- **Una regla por ítem en vez de por comanda** — el `ItemComanda` sin cocina escribe su movimiento al pasar
  a `listo`, y la comanda mixta queda entera. Viable y evitaba partir el pedido. No se eligió porque rompe
  el núcleo de ADR-0016: ahí `listo` es **reversible y gratis**, y deshacerlo no toca el libro. Hacer que
  algunos `listo` escriban y otros no deja **dos reglas sobre la misma tabla**, que es la clase de
  invariante que este diseño viene rechazando desde que eligió una fila por unidad en vez de sostener
  `anuladas + listas ≤ cantidad` a mano.

- **Que el ítem sin cocina dentro de un pedido mixto espere a que cocina termine la orden.** Viable y no
  partía nada. No se eligió porque el mismo ítem consumiría en **momentos distintos según con qué lo
  pidieron**: una gaseosa sola consume al enviarse y la misma gaseosa junto a un lomo consume media hora
  después. Un modelo cuyo comportamiento depende de la compañía del ítem es un modelo que nadie puede
  razonar.

- **Dejar a la bebida sin receta**, aceptando que su inventario se lleve por fuera. Descartada de entrada:
  un plato sin receta queda **no costeable** y sale de *platos más rentables*, así que no evita el problema
  —lo mueve del inventario al reporte, que es donde más duele.

## Consecuencias

- **El agotado automático empieza a funcionar donde más importa.** Una bebida que se termina desaparece de
  las tres estaciones en el mismo presupuesto de 5 segundos que cualquier otro plato. Hasta ahora no iba a
  desaparecer nunca.

- **El margen de las bebidas pasa a ser un dato.** `costo_fifo_snapshot` se llena por el mismo camino que
  el de un plato de cocina, así que entran a *platos más rentables* y a la matriz de ingeniería de menú
  sin ningún tratamiento especial.

- **El bloqueo del cierre de cocina desaparece por construcción**, no por una excepción: una comanda que
  nace `terminada` no puede estar pendiente, así que no hay nada que trabar. La propiedad que ADR-0016
  declara —*"el caso borde queda cerrado por imposibilidad"*— vuelve a ser cierta.

- **ADR-0006 no se modifica.** Su regla sigue siendo la única: el inventario se escribe al pasar a
  `terminada`. Esta decisión no agrega un momento de consumo, agrega una forma de llegar a ese estado.

- **Costo: una bebida anulada después de enviada registra pérdida por anulación aunque la botella esté sin
  abrir.** Es el precio de consumir temprano, y es real: infla la pérdida y deja el stock corto. Se
  regulariza con un **movimiento de ajuste** desde la bandeja de incidencias, que ya tiene ese
  `modo_regularizacion`. No se resuelve con una reversa porque el libro es append-only (ADR-0005) y no hay
  excepciones.

- **Costo: `Comanda` deja de ser uno a uno con la ronda.** Una ronda mixta produce dos comandas. La línea
  del PRD *"cada ronda genera una comanda nueva en cocina"* sigue siendo cierta para la de cocina, que es
  la que el mesero y el cocinero ven, pero el conteo interno de comandas ya no equivale al de rondas y los
  reportes que cuenten comandas tienen que saberlo.

- **Costo: la división roza el *"un envío nunca tiene éxito parcial"* de ADR-0019 y hay que leerlo bien.**
  Aquella regla es sobre el **rechazo** —el servidor no acepta la mitad y rechaza la otra— y sigue
  intacta: acá el pedido se acepta **entero**, y las dos comandas son representación interna de un envío
  que salió bien. Si alguna vez el rechazo y la división se cruzan en el mismo envío, manda el rechazo:
  primero se rechaza atómicamente, y recién sobre lo que el mesero decida reenviar se aplica la división.

- **Asimetría nueva, y conviene declararla: la escritura de inventario de las bebidas sí tiene autor.**
  ADR-0016 aceptó que el consumo de cocina sea **anónimo por diseño**, porque cocina no tiene identidad.
  Pero una comanda sin cocina la envía un mesero en sesión, así que su movimiento queda atribuido a una
  persona. El sistema pasa a tener dos clases de escritura de inventario —una con autor y otra sin él— y
  cualquier auditoría de consumo tiene que saber que la cobertura es parcial, no uniforme.

- **Costo: el mesero que envía la bebida y no la entrega ya bajó el stock.** Es el mismo perfil que
  ADR-0006 ya aceptó para el plato preparado y nunca cobrado, y cae en el mismo reporte de reconciliación
  entre consumo y venta que ese ADR dejó pendiente.
