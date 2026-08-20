# ADR 0040: Los identificadores del dominio van en español

## Estado

Aceptado — **precisa la regla de idioma del `CLAUDE.md`**, que decía *"código, identificadores,
comentarios y mensajes de commit: inglés"* sin contemplar que el modelo de datos del `TECH-DESIGN.md`
está escrito en español. Las dos cosas no podían ser ciertas a la vez.

## Contexto

El `TECH-DESIGN.md` nombra cada entidad y cada columna en español, y **los criterios de aceptación las
citan literalmente**: `vigente_desde`, `creada_por`, `numero_lote`, `requiere_cocina`,
`estado IN (abierta, en_cobro)`, `dia_operativo()`. No son descripciones en prosa: son los nombres con
los que 312 criterios verifican el sistema.

La regla de idioma vigente decía que los identificadores van en inglés. Aplicada al pie de la letra
obliga a traducir el modelo entero y a sostener un mapa mental entre el documento que manda y el
esquema real.

Y hay un argumento del propio proyecto que pesa acá. **ADR-0002 eligió un solo lenguaje de punta a
punta con una razón explícita**: *"un campo que se llama distinto en el backend y en el frontend es un
error de dinero silencioso"*. Traducir el dominio no elimina esa costura: la mueve. En vez de estar
entre backend y frontend, queda entre el documento que especifica y el código que implementa — donde
además nadie la compila y nadie la detecta.

## Decisión

**Los identificadores del dominio van en español, idénticos en la base, en el backend y en el
cliente.** Alcanza a tablas, columnas, entidades, campos del contrato tRPC y valores de enumeración.

**Todo lo demás sigue en inglés**: funciones auxiliares, variables locales, tipos de infraestructura,
nombres de archivos y carpetas técnicas, comentarios y mensajes de commit. La documentación, los
criterios de aceptación y la interfaz siguen en español, como ya estaban.

El corte es por **dominio**, no por capa: si el nombre aparece en el `TECH-DESIGN.md` o en un criterio
de aceptación, va en español.

## Alternativas consideradas

- **Todo en inglés** — coherente con la regla tal como estaba escrita, y más habitual en la industria.
  No se eligió porque obliga a traducir el modelo de datos completo y los nombres citados por 312
  criterios, y porque deja la verificación del sistema dependiendo de una tabla de equivalencias que
  nadie mantiene.

- **Español en la base e inglés en el código, con una capa de mapeo** — permite tener las dos cosas. No
  se eligió porque agrega exactamente la costura que ADR-0002 evitó, con el agravante de que el mapeo
  es código que hay que escribir, probar y mantener sincronizado con dos vocabularios.

## Consecuencias

- **Un criterio de aceptación se puede buscar literalmente en el código.** `vigente_desde` en el
  `TECH-DESIGN.md` es `vigente_desde` en la migración, en el tipo del backend y en el cliente. La
  trazabilidad entre especificación y implementación deja de depender de la memoria de nadie.

- **Costo: el límite entre "dominio" e "infraestructura" hay que sostenerlo con criterio.** Va a haber
  casos borrosos —un repositorio, un servicio, un DTO intermedio— y la regla no los resuelve sola. Ante
  la duda, manda si el nombre aparece en el `TECH-DESIGN.md`.

- **Costo: el código mezcla dos idiomas.** Una función en inglés que opera sobre columnas en español se
  lee raro las primeras veces. Es el precio de que el documento y el esquema digan lo mismo.

- **Costo: alguien que no hable español lee el dominio en español.** Aceptable: el proyecto entero
  —PRD, diseño técnico, criterios e interfaz— ya está en español.
