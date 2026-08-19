# ADR 0009: Registro de eventos persistido en PostgreSQL

## Estado

Aceptado

## Contexto

El PRD exige que, tras un corte de red del KDS, al reconectar se muestre el 100% de las comandas
emitidas durante el corte, en el orden FIFO original, con cero comandas perdidas en una prueba de 20
comandas con corte forzado.

Ningún transporte da esa garantía por sí solo: los búferes de reconexión viven en memoria del proceso
servidor y desaparecen si el proceso se reinicia.

## Decisión

Cada comanda, anulación y cambio de disponibilidad se escribe como evento en una tabla con secuencia
monotónica. El cliente reanuda desde el último ID que recibió.

## Alternativas consideradas

- **Búfer en memoria del servidor** — viable, sin infraestructura adicional, y cubre los cortes de red
  del cliente, que son el caso común y el que el PRD describe. No se eligió porque un reinicio del
  proceso durante el servicio vacía la cola y rompe una garantía que el PRD enuncia de forma explícita
  y verificable.
- **Broker externo** (Redis Streams, RabbitMQ) — viable y diseñado exactamente para esto, con
  retención y reanudación resueltas. No se eligió por agregar un servicio más que desplegar, monitorear
  y respaldar, para un volumen que una tabla resuelve holgadamente.

## Consecuencias

- La garantía sobrevive al reinicio del servidor, no solo al corte de red del cliente.
- El historial de eventos es consultable con SQL, lo que hace depurable la pregunta "por qué esta
  comanda no apareció en cocina".
- Costo: la tabla crece con cada evento y necesitará una política de archivado. Sin ella, la
  reanudación se vuelve progresivamente más lenta.
- Costo: cada evento es una escritura adicional en la misma base que sirve las transacciones de venta.
  Ambas compiten por el mismo recurso, justo en los momentos de mayor carga.
