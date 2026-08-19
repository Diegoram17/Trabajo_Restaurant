# ADR 0002: TypeScript de punta a punta

## Estado

Aceptado

## Contexto

El equipo es una persona. El PRD exige "diferencia 0" en cuatro criterios de éxito distintos —costo
FIFO, arqueo, comisión y estado de resultados—, lo que prohíbe punto flotante en todo el sistema: el
clásico `0.1 + 0.2 = 0.30000000000000004` convierte un arqueo cuadrado en un descuadre de un céntimo.

El dominio mueve muchos objetos con dinero adentro: venta neta, IGV, costo FIFO, propina, comisión.
Un campo que se llama distinto en el backend y en el frontend es un error de dinero silencioso.

## Decisión

TypeScript en el backend (Node) y en el frontend (React). La precisión monetaria se resuelve con
enteros en unidad mínima (ver ADR-0011), no con punto flotante.

## Alternativas consideradas

- **Python + React** (Django o FastAPI) — viable: `Decimal` es parte de la librería estándar, y Django
  habría dado el admin generado gratis, cubriendo buena parte de la gestión administrativa del PRD
  —menú, recetas, compras, personal— sin escribir pantallas. No se eligió porque obliga a definir los
  DTO de dinero dos veces y pierde la verificación por compilador entre capas.
- **C# / .NET + React** — viable y el más alineado con las exigencias del PRD: `decimal` nativo de 128
  bits diseñado para dinero, Entity Framework con transacciones sólidas y SignalR para tiempo real, todo
  en la misma caja. No se eligió por el peso de herramientas frente a un proyecto de una sola persona.

## Consecuencias

- Un solo lenguaje que sostener, y tipos compartidos entre capas: el compilador impide el
  desalineamiento de campos de dinero (se materializa en ADR-0010).
- Costo: JavaScript no tiene decimal nativo. La precisión monetaria depende de una convención
  explícita que hay que sostener en todo el código; nada en el lenguaje la impone.
- Costo: se pierde el admin generado que Django habría dado gratis. Las pantallas de menú, recetas,
  compras y personal hay que escribirlas a mano.
