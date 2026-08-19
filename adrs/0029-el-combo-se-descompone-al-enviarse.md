# ADR 0029: El combo se descompone al enviarse y no existe como fila de dominio

## Estado

Aceptado — cierra el hallazgo #7 de `REVISION-ADVERSARIAL.md`. Completa **ADR-0004** en el punto donde su
snapshot había quedado incompleto, y corrige el modelo de `ItemComanda`.

## Contexto

`ItemVenta` guarda `descripción, precio_unitario_neto, igv_unitario, cantidad, costo_fifo_snapshot`.
Vender un combo producía **una** fila: "Combo Familiar", su precio, su costo. Pero el PRD exige dos cosas
que necesitan la descomposición:

- *Platos más vendidos* **incluye las unidades vendidas dentro de combos**.
- *Platos más rentables* **reparte el precio del combo entre sus componentes**, proporcional a sus precios
  de lista.

Para calcular cualquiera de las dos había que leer `Combo` y `ComboItem` **vivos**. Y `ComboItem` es
editable —el módulo de gestión ofrece esa acción—, así que **cambiar la composición de un combo cambiaba
todos los reportes históricos**.

Eso es exactamente lo que ADR-0004 declara imposible por construcción: *"es imposible que un reporte de un
periodo cerrado cambie, porque no hay nada que recalcular"*. La reproducibilidad histórica, que ese ADR
llama *"el requisito central"*, se perdía justo en el módulo que el PRD nombra como entregable final.

**Y al modelarlo apareció que el problema no empezaba en la venta: empezaba una etapa antes.**

`ItemComanda` está definido como *"comanda, **plato o combo**"*, con **una fila por unidad** y **un estado
por fila** (`pendiente` | `listo` | `anulado` | `sin_insumo`). Pero el PRD dice que un combo *"entra al KDS
como **las unidades de esos platos**, una fila por unidad — cocina prepara platos, no combos"*.

Las dos cosas no pueden ser ciertas a la vez. Si un combo de tres platos fuera **una** fila de
`ItemComanda`, sería **una sola unidad marcable**: el cocinero no podría marcar sus componentes por
separado, ni anular uno solo, ni declarar *sin insumo* únicamente el que faltó. Se rompería el marcado en
dos pasos de ADR-0016, que es el flujo entero de la cocina.

O sea que **la descomposición ya tenía que ocurrir al enviar**, y `plato o combo` era un resto. Esto cambia
la naturaleza del arreglo: no se trata de inventar un patrón nuevo para la venta, sino de **hacer que la
venta sea consistente con lo que la comanda ya está obligada a hacer**.

## Decisión

**El combo se descompone en el momento del envío y no vuelve a existir como fila de dominio.** Vive en el
**menú** —para venderlo, ponerle precio y derivar su disponibilidad— y en la **presentación** —la cuenta y
el comprobante—, pero nunca como fila de comanda ni de venta.

```
ItemComanda   → siempre un plato. Nunca un combo.
                una fila por unidad, con su propio estado
                + combo_origen        FK, nulo si es venta directa
                + combo_descripcion   snapshot del nombre

ItemVenta     → una fila por componente, con el precio ya repartido
                y su costo_fifo_snapshot
                + combo_origen        + combo_descripcion

  Combo Familiar  S/45 neto
    ├─ Ceviche   precio 20   costo 8    combo_origen = CF
    ├─ Lomo      precio 18   costo 7    combo_origen = CF
    └─ Chicha    precio  7   costo 2    combo_origen = CF
                 ─────────
    SUM(ItemVenta) = 45          sin excluir nada
```

Con eso los dos criterios del PRD se vuelven directos: *platos más vendidos* es contar filas por plato, y
*platos más rentables* lee el precio repartido y el costo que ya están congelados en la fila. **Ninguna
consulta de reporte vuelve a leer `ComboItem` vivo**, que era la violación de ADR-0004.

### La regla del residuo

Repartir un precio entero entre componentes de forma proporcional **no cierra solo**: S/45 entre tres
componentes en céntimos deja resto. Sin una regla, la suma de los hijos deja de dar el precio del combo y
se rompe el invariante del estado de resultados.

```
1. reparto_i = truncar( precio_combo × precio_lista_i / Σ precio_lista )
2. residuo   = precio_combo − Σ reparto_i
3. se asigna 1 céntimo a cada componente, en orden descendente
   de precio de lista; empate por id de plato ascendente
```

Es determinista y **la suma cierra por construcción**, que es la propiedad que hace falta. Esta regla
cubre el reparto del combo y **no resuelve el hallazgo #9**: la regla general de redondeo para IGV,
comisión y merma es una decisión aparte.

> **Actualización — [ADR-0032](0032-regla-de-redondeo.md)** cerró el hallazgo #9 y **generalizó esta
> regla**. Lo que acá se resolvió para el combo resultó ser una de dos familias: *truncar y repartir el
> residuo* aplica siempre que **haya un total entero que respetar**, y el sistema tiene tres —el precio
> del combo, el costo fijo mensual entre días operativos, y el costo de un lote entre sus consumos—. Los
> porcentajes sin total que respetar —IGV, comisión, merma— van por la otra familia. Este reparto no
> cambia: cambió su estatus, de excepción del combo a caso de una regla nombrada.

## Alternativas consideradas

- **Línea padre más líneas hijas** — una fila para el combo con su precio cobrado, más N hijas con el
  reparto. Viable, y el comprobante saldría de la fila padre sin reagrupar nada, con el combo como venta
  de primera clase. No se eligió porque **toda consulta que sume `ItemVenta` tendría que excluir
  explícitamente padres o hijos**, o duplica el total. Es exactamente la forma del defecto que ADR-0027
  acaba de corregir con el estado `fusionada`, donde el proyecto ya había declarado el riesgo dos veces
  por escrito y aun así el predicado quedó mal. Un modelo en el que la consulta ingenua da el doble es un
  modelo que va a dar el doble.

- **Snapshot de la composición como JSON dentro de `ItemVenta`** — una fila, con la receta del combo
  congelada adentro. Viable y sin duplicación. No se eligió por el mismo motivo por el que ADR-0023
  rechazó usar `EventoOperacion` como fuente de reportes: un payload JSON sin índices analíticos obliga a
  desarmarlo para agregar, y *platos más vendidos* pasaría a ser un escaneo con desempaquetado en vez de
  un conteo.

- **Versionar `ComboItem` por vigencia**, de modo que la venta apunte a la composición que regía en su
  momento. Viable y más normalizado. No se eligió porque es la alternativa que **ADR-0004 ya evaluó y
  descartó** para platos y recetas, con un argumento que aplica igual acá: *"mete la dimensión tiempo en
  cada consulta de reporte, y hace que la reproducibilidad histórica dependa de que ninguna consulta
  olvide filtrar por vigencia — es decir, la convierte en disciplina en vez de estructura"*.

- **Dejar `ItemComanda` como `plato o combo` y descomponer solo en la venta.** Descartada al analizarla:
  no cierra el problema, lo parte. El KDS quedaría expandiendo combos en tiempo de lectura, con una unidad
  marcable que representa tres platos, y el marcado en dos pasos de ADR-0016 dejaría de funcionar.

## Consecuencias

- **La reproducibilidad histórica vuelve a ser estructural.** Editar la composición de un combo no puede
  alterar ninguna venta cerrada, porque ninguna venta cerrada la mira. ADR-0004 recupera la propiedad que
  declaraba tener.

- **El doble conteo es imposible por construcción**, no por cuidado: `SUM(ItemVenta)` da el total de la
  venta sin excluir nada. No hay un predicado que alguien pueda olvidar.

- **`ItemComanda` deja de ser ambiguo**, y con eso el marcado por unidad funciona también dentro de un
  combo: se puede marcar listo el ceviche, anular el lomo y declarar la chicha *sin insumo*, cada uno por
  su lado. Antes el modelo decía una cosa y el PRD otra.

- **La disponibilidad y el `requiere_cocina` del combo se derivan solos, y ahora también en la operación.**
  Si sus componentes son las filas reales, un combo que contiene un plato que requiere cocina produce
  unidades que requieren cocina, sin ninguna regla adicional en la puerta de envío de ADR-0019.

- **Costo: el comprobante y la cuenta tienen que reagrupar por `combo_origen`** para mostrar "1 Combo
  Familiar S/45" en vez de tres líneas sueltas. Es trabajo de presentación, y es el mismo patrón que el
  sistema ya usa en la dirección contraria: *"la cuenta muestra las unidades agrupadas porque agrupar es
  presentación; el KDS las muestra separadas porque ahí cada una se toca"*.

- **Costo: `combo_descripcion` duplica el nombre del combo en cada fila.** Es duplicación deliberada, del
  mismo tipo que ADR-0004 ya aceptó para la descripción del plato: si el combo se da de baja o se renombra,
  el comprobante histórico tiene que seguir diciendo lo que decía.

- **Costo: el reparto proporcional se congela con los precios de lista del momento de la venta.** Si
  después cambia el precio de lista de un componente, el reparto de las ventas viejas no se mueve — que es
  lo correcto, pero significa que dos ventas del mismo combo en meses distintos pueden repartir distinto.
  El dashboard tiene que poder explicarlo si alguien lo nota.

- **Costo: un combo con un solo componente produce una fila indistinguible de una venta directa**, salvo
  por `combo_origen`. No es un problema, pero cualquier reporte que quiera separar "vendido suelto" de
  "vendido en combo" tiene que mirar ese campo y no la descripción.
