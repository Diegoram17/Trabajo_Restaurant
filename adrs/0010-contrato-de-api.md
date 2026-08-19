# ADR 0010: tRPC como contrato entre backend y SPA

## Estado

Aceptado

## Contexto

Hay un backend y una SPA, ambos en TypeScript (ADR-0002). El motivo declarado de esa elección fue
impedir que un campo de dinero se llame distinto de cada lado, porque en este dominio eso es un error
silencioso que llega hasta el estado de resultados.

Esta decisión es donde ese motivo se cobra o se pierde.

## Decisión

tRPC. Los tipos del backend son directamente los tipos del cliente, sin generación de código ni
esquema intermedio.

## Alternativas consideradas

- **REST + OpenAPI** — viable: contrato explícito, versionable y legible por terceros, con tipos
  generados desde el esquema. Es lo que pediría una integración futura con un facturador electrónico.
  No se eligió porque la sincronía entre esquema e implementación la garantizaría la disciplina y no el
  compilador, que es exactamente lo que se quería evitar.
- **GraphQL** — viable y cómodo para un dashboard con agregaciones variadas, ya que el cliente pide
  solo los campos que necesita. No se eligió por desproporción frente a tres superficies de consultas
  estables y conocidas, y por el trabajo extra que exigen las agregaciones de reportes para no
  degenerar en N+1.

## Consecuencias

- Renombrar un campo en el backend rompe la compilación del frontend. El error de dinero por
  desalineamiento entre capas deja de ser posible.
- Costo: acoplamiento total. Cliente y servidor deben versionarse y desplegarse juntos, y no queda una
  API que un tercero pueda consumir — lo que importa si algún día entra el facturador electrónico que
  el PRD dejó fuera de alcance.
- Costo: el contrato no es inspeccionable sin leer el código TypeScript. No hay documento navegable ni
  posibilidad de probar endpoints con un cliente HTTP genérico.
