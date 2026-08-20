# ADR 0038: Vitest, y las pruebas que importan corren contra PostgreSQL real

## Estado

Aceptado — completa **ADR-0002**, que eligió TypeScript de punta a punta sin decidir con qué se prueba,
y le da a **ADR-0003** la forma de verificar lo que declaró.

## Contexto

Ningún documento del proyecto nombra un runner de pruebas: ni el `PRD.md`, ni el `TECH-DESIGN.md`, ni
los treinta y siete ADRs anteriores. El ítem #1 del `BACKLOG.md` es donde la elección se hace, y con
TDD estricto activo la prueba se escribe antes que el código — así que sin runner no hay primera línea.

La restricción real no es de gusto. **ADR-0003 eligió PostgreSQL descartando SQLite específicamente por
`SELECT ... FOR UPDATE`**, y sobre ese bloqueo de fila apoyan sus garantías ADR-0007 y ADR-0030: el
consumo FIFO ordenado por `numero_lote` y la concurrencia del inventario. Ningún doble de prueba exhibe
un bloqueo de fila. Una prueba de concurrencia contra un mock prueba el mock, no el sistema — y los
criterios de *"diferencia 0"* del costeo no toleran esa diferencia.

## Decisión

**Vitest**, y las pruebas que tocan concurrencia, FIFO o dinero corren contra una instancia real de
PostgreSQL levantada por el `globalSetup` del propio runner.

La SPA ya necesita Vite. Usar Vitest significa **una sola cadena de herramientas y una sola
configuración**: sin transformador de TypeScript aparte, sin resolución de ESM propia, sin un segundo
archivo de configuración que se desincroniza del primero.

## Alternativas consideradas

- **`node:test`** — viene con Node y no agrega ninguna dependencia, lo cual es genuinamente atractivo
  para un equipo de una persona. No se eligió porque hay que armar a mano las fixtures de base y sumar
  `tsx` para TypeScript: termina siendo la misma infraestructura, escrita por nosotros y sin mantener.

- **Jest** — el más conocido y con más material de consulta. No se eligió porque agrega una segunda
  cadena de herramientas al lado de Vite, que es exactamente lo que ADR-0002 evitó al poner un solo
  lenguaje de punta a punta.

## Consecuencias

- **Una sola configuración para compilar y para probar.** Lo que resuelve la SPA lo resuelve la prueba.

- **PostgreSQL real pasa a ser prerequisito de desarrollo.** No se puede clonar y probar sin una base
  levantada. Es un costo que ADR-0003 ya aceptó por escrito cuando eligió el motor por sus bloqueos.

- **Costo: las pruebas son más lentas que con dobles.** Esa lentitud es el precio de que prueben algo.
  Una suite rápida que no ejerce el bloqueo de fila da una confianza que no se corresponde con nada.

- **Costo: el runner queda atado a Vite.** El día que la SPA cambie de compilador, esta decisión vuelve
  a la mesa. No es un acoplamiento oculto: es la razón por la que se eligió.
