# POS para Restaurantes

Sistema de punto de venta de salón: pedido → cocina → cobro → inventario FIFO → dashboard de
rentabilidad. El entregable central **no es la operación, es el dato**: que el margen por plato salga de
la operación misma. Contexto Perú (IGV, boleta/factura, PEN). Trabajo académico, sin despliegue real.

**Greenfield: todavía no hay código.** Todo lo de abajo es diseño ya decidido.

## Dónde está cada cosa

Todo vive en la **raíz**. No mover a `docs/`.

| Archivo | Qué es | Autoridad |
|---|---|---|
| `PRD.md` | Qué hace el producto y para quién | **Manda** en producto |
| `TECH-DESIGN.md` | Modelo de datos, arquitectura, criterios de aceptación | **Manda** en técnica |
| `adrs/` | Una decisión por archivo, formato MADR | **Manda** en el porqué |
| `BACKLOG.md` | 30 ítems ordenados por dependencia, uno por ciclo SDD | Plan de trabajo |
| `SECURITY-REPORT.md` | Pase de seguridad, 10/10 cerrados | Histórico con estado |
| `REVISION-ADVERSARIAL.md` | Revisión adversarial previa, 6 hallazgos abiertos | Histórico con estado |
| `CHANGELOG.md` | Siete versiones del producto y qué reemplazó cada una | Histórico |
| `DESIGN.md` | Design system y decisiones de interfaz | Referencia visual |
| `prototypes/` | HTML de referencia, **no autoridad** | Ceden ante los de arriba |
| `openspec/` | Espejo en git de los artefactos SDD; el estado vivo está en engram | Andamio, cede ante los de arriba |

**Antes de responder sobre estructura o arquitectura, leé `TECH-DESIGN.md` — no adivines desde el
`PRD.md`.** Y no grepees `prototypes/`: el código real va comprimido en un bundle y no aparece.

## Cómo se trabaja acá

**Los ADRs son append-only.** Nunca reescribir uno. Lo vigente se rutea por el campo `Estado` del ADR y
por la tabla de *Decisiones de arquitectura* del `TECH-DESIGN.md`. Un ADR nuevo dice a quién completa,
precisa o reemplaza; el viejo dice quién lo tocó.

**Toda decisión nueva se propaga o no existe.** Un ADR sin su fila en la tabla, sin sus criterios de
aceptación y sin su ajuste en el modelo de datos **no está tomado**. Éste es el modo de falla dominante
del proyecto y está diagnosticado dos veces por revisiones independientes: *"no es decidir mal, es no
propagar lo decidido"*. Ocho de los diez hallazgos de seguridad fueron eso.

**Los criterios de aceptación viven en `TECH-DESIGN.md`**, en checkboxes `- [ ]` por flujo. Son la
especificación ejecutable del proyecto y hoy son 328.

**Cada ítem del backlog es un ciclo de SDD completo**, no el proyecto entero.

**Los artefactos de SDD viven en dos lugares, y en este orden: engram manda, `openspec/` refleja.**
El estado vivo se resuelve por `topic_key` (`sdd/{cambio}/{artefacto}`); `openspec/` es su espejo
versionado, para que el cambio se lea en un diff y el despachador nativo —que solo lee archivos y no
ve lo que está en memoria— pueda verlo. **Una fase no está cerrada hasta que existen los dos.** Si
divergen, gana engram y el espejo se regenera desde ahí, nunca al revés.

Antes era solo engram, justamente para no tener la misma spec en dos lados —el patrón que ADR-0013
rechaza—. El modo híbrido acepta ese costo a cambio del despachador y del diff, y lo acota con la
regla de precedencia de arriba. Lo que no cambia: las specs son andamio; el registro de decisiones
que se entrega es `PRD.md`, `TECH-DESIGN.md` y `adrs/`, y fusionar un delta **nunca** reemplaza
actualizarlos.

## Invariantes que no se negocian

Romper cualquiera de estos falla en silencio con un número plausible que no reconcilia.

- **Dinero: enteros en unidad mínima.** Nunca punto flotante. Una sola función de redondeo —al céntimo,
  medio hacia arriba— y un solo punto de aplicación (ADR-0011, ADR-0032). En SQL es `integer`, y los
  **porcentajes son enteros en puntos básicos** —18% es `1800`—, para que la multiplicación no vuelva a
  meter un flotante en el camino del dinero (ADR-0039).
- **El día es el día operativo: arranca a las 05:00 hora de Lima.** Se calcula con `dia_operativo()`,
  nunca se persiste. **Ningún `DATE(timestamp)` suelto es válido** (ADR-0028).
- **FIFO se ordena por `numero_lote`, jamás por fecha.** `Compra.fecha` es informativa (ADR-0030).
- **No existe costo unitario de insumo persistido.** El costo por gramo vive debajo del céntimo; se
  deriva del lote (ADR-0032).
- **No existe campo de stock.** El stock es la suma de los movimientos, y el libro es append-only sin
  excepciones — no hay reversas (ADR-0005).
- **La venta cerrada es un snapshot inmutable.** Cambiar receta o precio no toca ninguna venta pasada
  (ADR-0004).
- **Las vigencias van solo hacia adelante.** `vigente_desde` rechaza fechas pasadas (ADR-0022).
- **La autorización se resuelve contra `Cuenta.mesero`, nunca contra la mesa** (ADR-0017).
- **Cuentas abiertas se filtran con lista blanca `estado IN (abierta, en_cobro)`**, nunca con
  `<> cerrada` (ADR-0027).
- **El servidor es la única fuente de verdad.** El cliente cachea consultas y los eventos las invalidan;
  no hay store replicando dominio (ADR-0013).
- **`EventoOperacion` no tiene `payload`.** Es una señal de invalidación filtrada por rol de dispositivo;
  el dato se pide por tRPC (ADR-0035).
- **Ninguna regla de dinero vive en el cliente.** El rechazo siempre ocurre en el servidor, no solo en la
  interfaz.

## Stack

TypeScript de punta a punta. Backend Node + tRPC, SPA React, PostgreSQL. SSE para empuje del servidor
(HTTP/2 es requisito, no optimización).

**Corre alojado y con un solo origen** (ADR-0037): el backend en Render sirve también la SPA, y la base
es Neon. El TLS lo termina la plataforma — **no hay CA propia del local** y ninguna pantalla instala un
certificado raíz. El backend no expone ningún puerto en claro. El origen único no es preferencia de
despliegue: es la condición bajo la cual las cookies `SameSite` de ADR-0033 siguen funcionando.

Rutas: `/estacion`, `/kds`, `/cocina`, `/admin`. **No existe `/caja`** — el mesero cobra desde su
estación. **No existe el rol `cajero`.**

## Acceso, en una tabla

| Capa | Autoriza | Credencial |
|---|---|---|
| Dispositivo | Leer el stream SSE y presentarse como esa ruta. **Ninguna acción.** | Token ≥128 bits en cookie `httpOnly`, SHA-256 con sal, caduca a 90 días |
| Persona | Vender, cobrar, cerrar turno, gestionar | PIN de 4 dígitos (mesero) o usuario+contraseña (`/admin`), Argon2id |
| Llave de servicio | Abrir y cerrar la cocina | PIN de 6 dígitos, no identifica a nadie |

Verificar un **PIN exige cookie de dispositivo**; `/admin` **no** —`Dispositivo.rol` no tiene el valor
`admin`, y de ahí sale que la cadena de arranque se abra (ADR-0034).

Cocina **no tiene identidad ni sesión**: marcar no pide nada, y abrir/cerrar el servicio sí (ADR-0016,
ADR-0018).

## Idioma

Documentos, criterios de aceptación e interfaz: **español**. Código, comentarios y mensajes de commit:
**inglés**.

**Los identificadores del dominio son la excepción, y va en serio: van en español** (ADR-0040). Tablas,
columnas, campos del contrato tRPC y valores de enumeración se llaman igual en la base, en el backend y
en el cliente, y **coinciden literalmente con los nombres del `TECH-DESIGN.md`** — `vigente_desde`,
`numero_lote`, `estado IN (abierta, en_cobro)`. Si el nombre aparece en el `TECH-DESIGN.md` o en un
criterio de aceptación, va en español; todo lo demás —funciones auxiliares, variables locales, tipos de
infraestructura— va en inglés. Los nombres `warning` / `good` del `DESIGN.md` son nombres de color del
design system, no texto de pantalla.

## Git

Conventional commits. **Nunca** agregar `Co-Authored-By` ni atribución de IA.

## División de trabajo entre agentes (SDD multi-agente)

Este proyecto se desarrolla con **dos agentes** que se pasan el trabajo. La división de fases es fija:

| Fase | Agente |
|---|---|
| `propose` → `spec` → `design` → `tasks` | **Claude Code** |
| `apply` | **OpenCode** |
| `verify` | **Claude Code** |
| `archive` | **OpenCode** |

Reglas del handoff — aplicarlas siempre, sin que el usuario las repita:

1. **Un solo agente opera sobre el worktree a la vez.** Nunca correr los dos en paralelo sobre el
   mismo directorio: el handoff es secuencial, no simultáneo.
2. **Las decisiones de preflight viajan en el `tasks.md`.** `delivery_strategy`, `chain_strategy`,
   review budget y cualquier `size:exception` aceptado se escriben en el artefacto de tasks — el
   agente que aplica hereda esos supuestos; si no están escritos, no existen.
3. **Topic keys exactos**: `sdd/{cambio}/{artefacto}` (propose/spec/design/tasks/apply-progress/
   verify-report/archive-report). Inventar otra convención rompe el handoff en silencio.
4. **No planificar un cambio cuyas dependencias no estén aplicadas y fusionadas en `main`.** La spec
   de un ítem se escribe contra el código que existe, no contra el que va a existir.
5. **Push después de cada fase cerrada.** Un artefacto sincronizado en engram + `openspec/` se
   commitea y se pushea en el mismo movimiento — así ningún agente arranca desde una base vieja.
6. **El verify no confía en el relato del apply.** Corre los tests contra PostgreSQL real (ADR-0038)
   y consulta la base directamente; el `apply-progress` es narrativa, no evidencia.
7. **El checkpoint entre agentes es gate.** Antes de que el siguiente agente arranque su fase, se
   verifica que engram y `openspec/` existan y no diverjan (engram manda). Un artefacto roto no se
   propaga a la fase siguiente.
