# ADR 0012: Mesa con mesero asignado y bloqueo suave

## Estado

**Reemplazado por ADR-0017.** El PRD v1.4 cambió la premisa sobre la que se tomó esta decisión: la
cuenta pasó a ser del mesero y una mesa puede sostener varias cuentas abiertas a la vez, así que la
asignación, el bloqueo suave y la toma forzada dejaron de tener sujeto. Se conserva como registro
histórico.

## Contexto

El PRD lista como caso borde que dos meseros abran la misma mesa al mismo tiempo desde estaciones
distintas, y advierte que eso "contamina comisiones y propinas".

Al modelarlo se hizo explícita una distinción que el PRD tenía implícita: **la comisión y la propina no
siguen al mismo sujeto**. La comisión se calcula sobre las ventas cobradas del mesero, y cada comanda ya
registra quién la tomó, así que sigue a la **comanda**. La propina, en cambio, "se registra sobre la
mesa, que tiene un solo mesero asignado", así que sigue a la **mesa**.

## Decisión

La mesa tiene un mesero asignado, que es el primero que la abre. Otra estación ve quién la tiene y
puede forzar la toma, dejando registro. Las comandas siguen guardando quién las tomó, de modo que la
comisión es exacta aunque intervenga otro mesero; la propina va al asignado.

## Alternativas consideradas

- **Sin asignación, con propina repartida** proporcional a lo vendido por cada mesero en esa mesa —
  viable y más justo cuando dos meseros atienden juntos, y elimina el bloqueo por completo. No se
  eligió porque contradice el PRD y el bloque de propina del `DESIGN.md`; adoptarla exigía cambiar ambos
  documentos.
- **Bloqueo duro** (solo el mesero asignado puede tocar la mesa) — viable y de atribución perfecta. No
  se eligió porque un mesero que termina su turno con mesas abiertas las deja sin poder cobrar hasta que
  intervenga el administrador, lo que convierte un caso normal de operación en una incidencia.

## Consecuencias

- Comisión y propina se atribuyen por caminos distintos y correctos, sin que uno contamine al otro.
- Costo: una estación que se cuelga con una mesa tomada la bloquea hasta que expire el tiempo de
  espera. Ese tiempo es un parámetro que hay que elegir y ninguna elección deja contento: corto permite
  pisarse, largo deja mesas rehenes.
- Costo: forzar la toma es una acción que hay que diseñar, registrar y explicar en la interfaz. Agrega
  un caso que el mesero debe entender en medio del servicio.
