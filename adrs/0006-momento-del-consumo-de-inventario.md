# ADR 0006: El inventario se descuenta al marcar la comanda como preparada

## Estado

Aceptado — refinado por **ADR-0016** (el momento exacto es *terminar la orden*, no marcar cada unidad) y
**extendido por ADR-0026**, que cubre el único caso que esta regla no alcanzaba: el ítem que **no pasa por
cocina**. ADR-0026 **no agrega un momento de consumo**: la comanda sin cocina nace ya `terminada`, así que
sigue rigiendo la regla de este ADR — el inventario se escribe al pasar a `terminada`.

## Contexto

El PRD contenía dos reglas incompatibles, detectadas al bajar el producto a diseño técnico:

> "Al confirmar el pago: se libera la mesa, se cierra la venta y se alimentan inventario, comisiones y
> reportes." — ata el inventario **al cobro**.

> "Aún no preparada — no descuenta inventario. No se produjo nada. Ya marcada como preparada por
> cocina — descuenta los insumos (se consumieron de verdad)." — ata el inventario **a la preparación**.

Físicamente manda la segunda: los insumos se van cuando el cocinero cocina, no cuando el cliente paga.
La diferencia no es teórica — si el stock baja recién al cobrar, diez mesas pueden pedir el mismo plato
durante el servicio y el sistema seguirá reportando stock disponible, porque ninguna pagó todavía. El
marcado automático de agotado llegaría siempre tarde.

El conflicto se presentó al usuario antes de tomar la decisión.

## Decisión

El movimiento de inventario se escribe cuando cocina marca la comanda como preparada. El cobro deja de
escribir inventario: solo cierra la venta, calcula la comisión y libera la mesa.

> **Refinamiento (2026-08-18, ADR-0016).** El *momento* de esta decisión no cambió —sigue siendo la
> preparación, no el cobro—, pero el evento exacto sí. Cocina marca en **dos pasos**: cada unidad se
> marca como *lista* (reversible, sin efecto contable) y después la orden completa se marca como
> **terminada**. El inventario se escribe **al terminar la orden**, no al marcar cada unidad. Ver
> ADR-0016 para el detalle y su motivo.

## Alternativas consideradas

- **Consumo al cobrar** (lo que decía el PRD) — viable y más simple: un solo punto de escritura, con
  venta y costo armados en la misma transacción. No se eligió por el desfase descrito: stock atrasado
  durante todo el servicio y agotado automático siempre tardío.
- **Reserva al pedir, consumo al preparar** — viable y el más fiel a la operación de un restaurante:
  el stock disponible baja al confirmar el pedido, así que nadie sobrevende. No se eligió por
  introducir dos nociones de stock —disponible y físico— que toda consulta debe distinguir, a cambio de
  evitar un caso raro en un local de tres estaciones.

## Consecuencias

- El stock refleja lo que la cocina realmente usó, y el marcado automático de agotado se dispara a
  tiempo.
- La regla especial de anulación posterior a la preparación deja de ser necesaria: el consumo ya
  ocurrió por su cuenta y anular solo cancela la venta. La pérdida por anulación se registra por
  diferencia entre lo consumido y lo vendido.
- Costo: inventario y venta se escriben en momentos y transacciones distintas. Un plato preparado y
  nunca cobrado descuenta stock sin generar venta — que es lo correcto, pero obliga a un reporte de
  pérdidas que reconcilie ambos lados.
- **Costo: esta decisión modifica el PRD.** La línea del flujo de cobro afirmaba que el pago alimenta el
  inventario y había que reescribirla. **Hecho en el PRD v1.3**: el flujo de cobro ahora dice que alimenta
  comisiones y reportes, y que el inventario se descuenta cuando cocina termina la orden.
