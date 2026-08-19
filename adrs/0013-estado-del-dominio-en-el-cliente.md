# ADR 0013: El servidor es la única fuente de verdad

## Estado

Aceptado

## Contexto

El PRD exige que un plato marcado como agotado desaparezca de las 3 estaciones en ≤ 5 segundos. Con
tres superficies mirando simultáneamente el mismo dominio, la pregunta es si el cliente mantiene su
propia copia del estado o si siempre lo pide.

## Decisión

El servidor es la única fuente de verdad. El cliente mantiene una caché de consultas que los eventos
del servidor invalidan; no existe un store global replicando entidades del dominio.

## Alternativas consideradas

- **Store global sincronizado** (Zustand o Redux) actualizado en el lugar por los eventos, sin refetch
  — viable, más rápido y más tolerante a red intermitente, porque no requiere un viaje de red por cada
  cambio. No se eligió porque crea una segunda fuente de verdad, y toda divergencia entre ella y el
  servidor es un error silencioso en un sistema donde los datos son dinero.

## Consecuencias

- El criterio de los 5 segundos sale como consecuencia del diseño: llega el evento, se invalida la
  consulta del menú, las tres estaciones se repintan. No hay que sostenerlo a mano.
- Es imposible que dos superficies muestren versiones distintas del mismo dato.
- Costo: cada invalidación cuesta un viaje de red. Con la red degradada la interfaz se siente más lenta
  que con un store local — justo cuando peor está la conexión.
- Costo: una ráfaga de eventos (varias comandas seguidas) puede provocar varias invalidaciones de la
  misma consulta. Hay que agrupar o limitar la frecuencia para no encadenar refetches innecesarios.
