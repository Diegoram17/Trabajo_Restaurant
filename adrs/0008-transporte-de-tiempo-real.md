# ADR 0008: Server-Sent Events para las actualizaciones en vivo

## Estado

Aceptado

## Contexto

El PRD impone tres exigencias de transporte: la comanda llega al KDS en ≤ 3 segundos, el plato agotado
desaparece de las 3 estaciones en ≤ 5 segundos, y tras un corte de red del KDS se muestra al reconectar
el 100% de las comandas emitidas durante el corte, en orden FIFO.

Conviene separar un punto antes de elegir: **esa última garantía no la da el transporte**. El búfer de
reconexión de cualquier librería vive en memoria del servidor y se pierde si el proceso se reinicia. La
garantía la da un registro persistido (ADR-0009); el transporte solo decide cómo se reanuda desde ahí.

## Decisión

El servidor empuja por Server-Sent Events. Lo que el cliente envía —confirmar pedido, marcar preparada,
cobrar— viaja por llamadas normales. La reanudación usa el encabezado `Last-Event-ID` contra el registro
de eventos.

## Alternativas consideradas

- **WebSocket (Socket.IO)** — viable, bidireccional, con salas por rol y reconexión automática
  incluida; es la respuesta general para tiempo real y la más flexible a futuro. No se eligió porque el
  único empuje del cliente al servidor que este producto necesita es una llamada puntual, de modo que la
  mitad bidireccional quedaría sin uso, y porque su búfer de reconexión da una falsa sensación de
  durabilidad: la garantía hay que persistirla igual.
- **Polling cada 2 segundos** — viable, cumple los umbrales y es trivial de construir y depurar. No se
  eligió porque genera tráfico constante de 5 clientes contra la base y obliga a escribir la
  reanudación de todos modos, sin ninguna ventaja compensatoria.

## Consecuencias

- `Last-Event-ID` provee la semántica de reanudación que el PRD pide de forma casi declarativa, sin
  escribir el protocolo.
- Sin dependencias de transporte, y atraviesa cualquier proxy o red doméstica sin configuración
  especial.
- Costo: es unidireccional. Si en el futuro aparece una necesidad de empuje continuo del cliente al
  servidor, hay que sumar un segundo transporte o migrar.
- Costo: los navegadores limitan las conexiones HTTP/1.1 concurrentes por origen. Varias pestañas de la
  misma estación pueden agotarlas, de modo que **HTTP/2 es un requisito de producción**, no una
  optimización.
