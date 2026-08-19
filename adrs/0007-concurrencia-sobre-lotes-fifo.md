# ADR 0007: Bloqueo pesimista sobre lotes en el consumo FIFO

## Estado

Aceptado — **completado por ADR-0030**. Este ADR decidió cómo se **serializa** el consumo, pero no por qué
campo se **ordenan** los lotes. La clave vigente es el **número de lote** (orden de registro), un orden
total sin desempate; `Compra.fecha` es informativa y no participa del ordenamiento.

## Contexto

Hasta 3 estaciones venden a la vez sobre un mismo inventario. Dos consumos simultáneos del mismo
insumo pueden leer el mismo lote y consumirlo dos veces, lo que rompe el costeo FIFO — es decir, la
tesis del producto.

## Decisión

`SELECT ... FOR UPDATE` sobre los lotes del insumo dentro de la transacción de consumo, tomando los
insumos siempre en orden de ID para que dos transacciones nunca se bloqueen mutuamente.

## Alternativas consideradas

- **Control optimista con reintento** (versión por lote; si otra transacción lo tocó, falla y se
  reintenta) — viable y sin bloqueos, con mejor rendimiento bajo poca contención. No se eligió porque
  un plato popular en hora pico es exactamente el caso de alta contención, y acotar el ciclo de
  reintentos requiere una política que termina serializando igual, con más código.
- **Cola serializada de consumos con un solo consumidor** — viable y trivial de razonar: elimina la
  concurrencia por completo. No se eligió porque convierte el inventario en un cuello de botella
  global y agrega un componente más que desplegar y monitorear.

## Consecuencias

- Serializa únicamente a las transacciones que compiten por el mismo insumo; cuando no hay conflicto,
  no cuesta nada.
- El orden por ID de insumo elimina los interbloqueos por construcción, no por detección y reintento.
- Costo: una transacción larga que tome lotes bloquea a las demás sobre ese insumo. La transacción de
  consumo debe mantenerse corta y no puede hacer trabajo de red dentro del bloqueo — una restricción
  que hay que respetar en todo el código que la toque.
