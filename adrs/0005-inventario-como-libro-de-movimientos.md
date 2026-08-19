# ADR 0005: El inventario es un libro de movimientos

## Estado

Aceptado

## Contexto

El PRD requiere costeo FIFO por lote, stock visible en todo momento, alerta de insumo por agotarse, y
una bandeja de incidencias con las ventas que dejaron stock negativo.

Esa bandeja es la que fuerza la decisión: para que sea accionable, el administrador tiene que poder
responder *por qué* el stock es el que es, no solo cuánto es.

## Decisión

Libro de movimientos append-only. Cada compra es una entrada con su lote; cada consumo es una salida
ligada al lote del que salió. El stock de un insumo es la suma de sus movimientos.

## Alternativas consideradas

- **Saldo mutable en `Insumo` con lotes en tabla aparte** — viable, más simple de escribir y mucho más
  barato de leer: el stock es un campo, no una agregación. No se eligió porque el saldo puede
  desincronizarse de los lotes sin dejar rastro, y la bandeja de incidencias quedaría sin forma de
  reconstruir cómo se llegó al número.

## Consecuencias

- Auditable de origen: todo saldo se descompone en los movimientos que lo produjeron, que es
  exactamente lo que la bandeja de incidencias necesita para ser útil.
- Costo: el libro crece sin límite. Con el volumen de un restaurante, calcular el stock sumando
  movimientos deja de ser viable en algún momento y va a requerir un saldo materializado por insumo —
  es decir, la alternativa descartada, reintroducida después como caché derivada.
- Costo: toda lectura de stock es una agregación, no un campo. Las consultas son más caras desde el
  primer día, incluidas las de la pantalla de pedidos, que consulta disponibilidad constantemente.
