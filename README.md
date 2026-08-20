# POS para Restaurantes — arranque local

Esta guía cubre únicamente lo que el ítem #1 del `BACKLOG.md` (*app-skeleton-base-schema*) entrega:
un proceso Node que sirve la SPA y la API tRPC desde un solo origen, con el esquema base migrado
sobre PostgreSQL. No hay operación de negocio detrás todavía — ver [Qué NO hace este
ítem](#qué-no-hace-este-ítem) más abajo.

`PRD.md` manda en producto y `TECH-DESIGN.md` manda en técnica; esta guía no repite ni reemplaza sus
criterios de aceptación, solo documenta cómo llegar a un proceso corriendo.

## Requisitos

- Node.js ≥ 20 (`engines` en `package.json`).
- PostgreSQL **17.x** localmente. El proyecto no fija una versión menor en ningún ADR; se documenta
  17.x porque es la versión (17.11) contra la que este ítem se migró y probó realmente en este
  entorno. En producción PostgreSQL corre gestionado en Neon (ADR-0037 §1) — sigue siendo
  PostgreSQL, así que el esquema y las pruebas de bloqueo de fila (ADR-0003, ADR-0038) se comportan
  igual en ambos lados.
- No hace falta cuenta de Render ni de Neon para nada de lo que sigue: correr localmente es la
  definición de "corriendo" para este ítem (spec `app-skeleton`, requisito *Verifiable "Running"
  State*).

## 1 — Preparar PostgreSQL: un rol y **dos** bases

```sql
CREATE ROLE restaurant_app WITH LOGIN PASSWORD '<elegí una contraseña>';
CREATE DATABASE trabajo_restaurant_dev  OWNER restaurant_app;
CREATE DATABASE trabajo_restaurant_test OWNER restaurant_app;
```

**Por qué dos bases y no una.** `trabajo_restaurant_dev` es la que persiste: la migrás una vez y
queda como el estado que vas explorando a mano mientras desarrollás. `trabajo_restaurant_test` es
descartable a propósito — la suite de integración (ADR-0038) la migra en cada corrida a través de
`tests/setup/global-setup.ts` y algunos ítems futuros del backlog van a necesitar truncarla entre
pruebas para aislar escenarios. Si fuera la misma base, cada `npm test` competiría con lo que tenés
armado a mano en desarrollo, y un `TRUNCATE` de una prueba te borraría datos que no eran de la
prueba. Las migraciones son solo-hacia-adelante (ADR-0022, ADR-0028): no hay comando para "deshacer"
si una prueba corre contra la base equivocada.

## 2 — Variables de entorno

Creá un archivo `.env` en la raíz con las cuatro variables de la tabla de abajo. **No hay
`.env.example` para copiar, y es deliberado**: el repositorio no contiene ningún archivo de entorno,
ni siquiera de ejemplo, así que no existe la posibilidad de que alguien complete una plantilla y la
suba sin darse cuenta. `.env` está en `.gitignore`.

| Variable | Para qué | Quién la lee |
|---|---|---|
| `APP_ORIGIN` | El origen exacto (esquema+host+puerto) contra el que se valida el header `Origin` en cada mutación (ADR-0033 §3). Sin valor, el proceso **no arranca** — no hay default silencioso. | `src/server/config/env.ts` |
| `DATABASE_URL` | Cadena de conexión a `trabajo_restaurant_dev`. La usan el proceso y `npm run migrate`. | `src/server/db/pool.ts`, `scripts/migrate.ts` |
| `TEST_DATABASE_URL` | Cadena de conexión a `trabajo_restaurant_test`. Solo la usa la suite de integración, nunca el proceso. | `tests/setup/global-setup.ts` |
| `PORT` | Puerto de escucha, opcional. Si no está, el proceso escucha en `3000`. | `src/server/index.ts` |

Nunca se escribe una credencial real en un archivo versionado — ni acá, ni en `.env.example`.

## 3 — Instalar, migrar, construir, arrancar

```bash
npm install
npm run migrate   # aplica migrations/ contra DATABASE_URL — es un no-op si ya está al día
npm run build      # vite build (SPA) + tsc (servidor) → dist/
npm run start       # node dist/server/index.js, atado a 127.0.0.1 (ADR-0041)
```

Con eso arriba, las cuatro rutas y la API tRPC responden desde el mismo origen:

```bash
curl http://127.0.0.1:3000/estacion   # 200, documento de la SPA
curl http://127.0.0.1:3000/trpc/ping  # 200, JSON con { ok: true, servedAt }
```

`npm run dev` (`tsx watch src/server/index.ts`) recarga el servidor en caliente, pero **no** reconstruye
la SPA — igual necesita que `dist/client/` exista de una corrida previa de `npm run build`. Este
esqueleto no tiene un servidor de desarrollo de Vite aparte: un solo proceso sirve ambas cosas por
diseño (requisito *Single-Origin Serving*), así que un cambio en `src/client/` necesita otro
`npm run build` para verse.

### Comandos, de un vistazo

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga en caliente, contra `dist/client/` ya construido |
| `npm run build` | SPA (Vite) + servidor (`tsc`) → `dist/` |
| `npm run start` | Corre el build de producción, un solo proceso |
| `npm run migrate` | Aplica migraciones pendientes contra `DATABASE_URL` |
| `npm test` | Suite completa — **necesita `TEST_DATABASE_URL` alcanzable** |
| `npm run test:unit` | Solo la capa unitaria — **no toca ninguna base** |
| `npm run typecheck` | `tsc --noEmit`, resolución Bundler (IDE) |

## 4 — Las dos capas de pruebas, y la trampa entre ellas

**`npm run test:unit` corre sin base de datos. `npm test` necesita una base alcanzable.** Esa es la
frase más importante de este documento: alguien puede correr solo la capa unitaria, ver todo en
verde, y creer que el sistema está probado. No lo está — `npm run test:unit` cubre el validador de
`Origin`, el contenedor de rutas estáticas y el orden de migraciones como funciones puras, sin base
y sin socket —no usa dobles: no hay nada que simular—; **no**
ejercita el esquema real, el round-trip de tRPC por HTTP, ni el bind a loopback. Esas tres cosas solo
las prueba `npm test` contra PostgreSQL real (ADR-0038) — es la única corrida que cuenta como
evidencia de que el sistema funciona de punta a punta.

## Qué NO hace este ítem

El esqueleto deja el sistema en un estado deliberadamente vacío. Para no confundirlo con el
producto:

- Las tres tablas de configuración (`configuracion_costos`, `calendario_apertura`,
  `configuracion_operativa`) se migran **sin ninguna fila** y sin ningún valor por `DEFAULT` —
  cargarlas es responsabilidad del ítem **#25** del `BACKLOG.md`, no de este.
- **No hay ningún valor de configuración fijado**: ni IGV, ni comisión, ni merma, ni horario de
  apertura. Ninguna columna que debería llevar un valor tiene uno inventado.
- **No hay fila semilla ni administrador.** No existe todavía `Persona`, `Cuenta` ni ningún dato de
  acceso — eso empieza en el ítem **#3**.
- Las cuatro rutas (`/estacion`, `/kds`, `/cocina`, `/admin`) son placeholders sin UI de dominio.
- No hay `FOR UPDATE`, no hay FIFO, no hay ninguna regla de negocio: este ítem no escribe una sola
  fila de dominio.

## Qué NO prueba este repositorio

**Provable acá:** el proceso escucha solo en `127.0.0.1` — conectar a la IP no-loopback de la propia
máquina en el mismo puerto da `ECONNREFUSED` real — y una petición que llega con
`X-Forwarded-Proto: http` se rechaza (4xx) y nunca se redirige (sin `Location`).
`tests/integration/transport.test.ts` prueba exactamente eso.

**No provable acá, y no es de este repositorio:** el rechazo real del tráfico en claro en el
**origen público** es trabajo del borde de la plataforma (ADR-0037 §4, ADR-0041) — el proceso Node
legítimamente recibe tráfico ya descifrado desde adentro del perímetro de esa plataforma, así que una
prueba que le exigiera rechazar todo lo no cifrado afirmaría lo contrario de la arquitectura
documentada. Esta guía y la suite dejan esa frontera declarada, no disimulada.
