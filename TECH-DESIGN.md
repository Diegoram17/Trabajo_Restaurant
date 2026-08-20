# Technical Design Document: POS para Restaurantes

**Tipo de proyecto:** Greenfield — sin código previo. Todas las decisiones se tomaron en este proceso.
**Design.md disponible:** Sí — `DESIGN.md` se usó como entrada del modelo de datos; varias entidades y
campos salen de lo que la interfaz revela que hay que mostrar, no del PRD.
**Alineado con:** `PRD.md` — sin rol de cajero (el mesero cobra y cierra turno en su estación) y con
el flujo de cocina en dos pasos sobre dos pantallas sin identificación. Los archivos de `prototypes/` son
**referencia, no autoridad**: donde un prototipo y este documento discrepen, **gana este documento**, y el
prototipo se actualiza o se reemplaza cuando el proyecto lo requiera.

## Resumen

Sistema de punto de venta para un restaurante de salón que cubre el ciclo completo —toma de pedido,
cocina, cobro y descuento de inventario— y culmina en un dashboard de rentabilidad construido con
costeo FIFO real. El entregable central del PRD no es la operación sino el dato: que el margen por
plato y la utilidad estimada salgan de la operación misma, sin planillas auxiliares.

Ese objetivo es el que ordena las decisiones técnicas: la exactitud monetaria y la reproducibilidad
histórica pesan más que el rendimiento o la flexibilidad, y varias decisiones aceptan costo operativo
a cambio de que un número del dashboard nunca cambie una vez cerrado.

## Arquitectura de componentes

Dos artefactos desplegables (ADR-0001):

```
┌──────────────────────────────────────────────────────┐
│  SPA (React + TypeScript)                            │
│  /estacion · /kds · /cocina · /admin                 │
└──────────────┬─────────────────────┬─────────────────┘
               │ tRPC (llamadas)     │ SSE (eventos)
               ▼                     ▲
┌──────────────────────────────────────────────────────┐
│  Backend (Node + TypeScript)                         │
│  ├─ Router tRPC          — contrato tipado           │
│  ├─ Dominio              — FIFO, costeo, comisiones  │
│  ├─ Emisor de eventos    — escribe y publica         │
│  └─ Canal SSE            — reanuda por Last-Event-ID │
└──────────────────────────┬───────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────┐
│  PostgreSQL                                          │
│  Dominio · Libro de movimientos · Registro de eventos│
└──────────────────────────────────────────────────────┘
```

**Responsabilidades**

- **SPA** — cuatro rutas en tres contextos de uso, cada una con su tema y densidad. Cocina son **dos**
  (ADR-0016): `/kds` es la pantalla de pared, **solo lectura y sin sesión**, y `/cocina` es la estación
  táctil que marca las comandas, autorizada por **estar iniciada** y ser el dispositivo de la cocina —
  **sin turno y sin sesión**. El marcado no pide nada; **abrir y cerrar el servicio sí exigen el PIN de
  cocina**, que es llave del servicio y no identidad (ADR-0018). `/admin` agrupa gestión y
  dashboard bajo el mismo rol y tema. **No existe una ruta `/caja`**: desde la v1.2 el cobro es una vista
  dentro de `/estacion` (PRD, *Cobro (mesero)*). No guarda estado del dominio (ADR-0013): consulta, y los
  eventos invalidan su caché.
- **Backend** — dueño de todas las reglas de negocio. Ninguna regla de dinero vive en el cliente.
- **PostgreSQL** — además del dominio, aloja el libro de movimientos de inventario (ADR-0005) y el
  registro de eventos que sostiene la garantía de entrega al KDS (ADR-0009).

**Comunicación** — llamadas del cliente al servidor por tRPC; empuje del servidor al cliente por SSE.
La reanudación tras un corte usa `Last-Event-ID` contra la secuencia del registro de eventos.

## Decisiones de arquitectura

| # | Decisión | Estado |
|---|---|---|
| [ADR-0001](adrs/0001-arquitectura-de-componentes.md) | Un backend y una SPA multi-rol | Aceptado |
| [ADR-0002](adrs/0002-stack-de-aplicacion.md) | TypeScript de punta a punta | Aceptado |
| [ADR-0003](adrs/0003-motor-de-base-de-datos.md) | PostgreSQL como motor de base de datos | Aceptado |
| [ADR-0004](adrs/0004-venta-cerrada-como-snapshot.md) | La venta cerrada es un snapshot inmutable | Aceptado, **completado por 0029** |
| [ADR-0005](adrs/0005-inventario-como-libro-de-movimientos.md) | El inventario es un libro de movimientos | Aceptado |
| [ADR-0006](adrs/0006-momento-del-consumo-de-inventario.md) | El inventario se descuenta al preparar | Aceptado, **refinado por 0016 y extendido por 0026** |
| [ADR-0007](adrs/0007-concurrencia-sobre-lotes-fifo.md) | Bloqueo pesimista sobre lotes FIFO | Aceptado, **completado por 0030** |
| [ADR-0008](adrs/0008-transporte-de-tiempo-real.md) | Server-Sent Events para actualizaciones en vivo | Aceptado |
| [ADR-0009](adrs/0009-durabilidad-de-la-cola-de-eventos.md) | Registro de eventos persistido en PostgreSQL | Aceptado, **precisado por 0035** |
| [ADR-0010](adrs/0010-contrato-de-api.md) | tRPC como contrato entre backend y SPA | Aceptado |
| [ADR-0011](adrs/0011-representacion-de-importes.md) | Los importes son enteros en unidad mínima | Aceptado, **completado por 0032** |
| [ADR-0012](adrs/0012-concurrencia-sobre-la-mesa.md) | Mesa con mesero asignado y bloqueo suave | **Reemplazado por ADR-0017** |
| [ADR-0013](adrs/0013-estado-del-dominio-en-el-cliente.md) | El servidor es la única fuente de verdad | Aceptado, **propagado al registro de eventos por 0035** |
| [ADR-0014](adrs/0014-sesion-en-estacion-compartida.md) | Sesión corta con cierre automático | Aceptado, **precisado por 0020, completado por 0031** |
| [ADR-0015](adrs/0015-sin-escritura-sin-conexion.md) | Las estaciones no escriben sin conexión | Aceptado |
| [ADR-0016](adrs/0016-identidad-en-cocina.md) | Cocina: sin identidad de usuario, con autoridad sobre el servicio | Aceptado, **enmendado por 0018, 0019, 0031 y el PRD v1.5** |
| [ADR-0017](adrs/0017-cuenta-por-mesero.md) | La cuenta es del mesero y el estado de la mesa se deriva | Aceptado, **predicado corregido por 0027** |
| [ADR-0018](adrs/0018-credencial-de-cocina.md) | La credencial de cocina es una llave del servicio, no una identidad | Aceptado, **completado por 0031** |
| [ADR-0019](adrs/0019-ventana-de-servicio-simetrica.md) | Ventana de servicio simétrica y rechazo atómico de la comanda | Aceptado, **precisado por 0026 y 0028** |
| [ADR-0020](adrs/0020-turno-como-registro-de-horas.md) | El turno es el registro de horas, no la sesión de estación | Aceptado, **riesgo cerrado por 0024, precisado por 0028** |
| [ADR-0021](adrs/0021-dias-operativos-y-prorrateo.md) | El día operativo sale de un calendario de apertura propio | Aceptado, **precisado por 0028** |
| [ADR-0022](adrs/0022-estabilidad-del-resultado.md) | Reportes al vuelo, estables por vigencia hacia adelante | Aceptado, **precisado por 0028** |
| [ADR-0023](adrs/0023-marcas-de-tiempo-operativas.md) | Las duraciones se miden en la entidad dueña del hecho | Aceptado, **precisado por 0028** |
| [ADR-0024](adrs/0024-cierre-tardio-de-turno.md) | El turno sin cerrar lo cierra el administrador, con hora corregible | Aceptado |
| [ADR-0025](adrs/0025-movimiento-y-fusion-de-cuentas.md) | La cuenta se mueve de mesa, y se fusiona solo dentro del mismo mesero | Aceptado, **corregido por 0027** |
| [ADR-0026](adrs/0026-consumo-del-item-sin-cocina.md) | El ítem que no requiere cocina consume inventario al enviarse | Aceptado |
| [ADR-0027](adrs/0027-cuenta-fusionada-y-marca-de-mesa.md) | La cuenta fusionada no ocupa la mesa, y el cambio de mesa se marca en la comanda | Aceptado |
| [ADR-0028](adrs/0028-dia-operativo.md) | El día operativo arranca a las 05:00 y es la única unidad de día | Aceptado |
| [ADR-0029](adrs/0029-el-combo-se-descompone-al-enviarse.md) | El combo se descompone al enviarse y no existe como fila de dominio | Aceptado |
| [ADR-0030](adrs/0030-clave-de-ordenamiento-fifo.md) | El consumo FIFO se ordena por número de lote, no por fecha de compra | Aceptado |
| [ADR-0031](adrs/0031-politica-de-acceso.md) | Tres capas de acceso: dispositivo, persona y llave de servicio | Aceptado, **completado por 0033, 0034, 0035 y 0036** |
| [ADR-0032](adrs/0032-regla-de-redondeo.md) | La regla de redondeo y su punto de aplicación | Aceptado, **completa 0011** |
| [ADR-0033](adrs/0033-transporte-cifrado-y-atributos-de-sesion.md) | TLS con CA propia del local, y los atributos de sesión que habilita | Aceptado, **completa 0031**, sección 1 **reemplazada por 0037** |
| [ADR-0034](adrs/0034-el-dispositivo-es-precondicion-del-pin.md) | El dispositivo es precondición del PIN, no de la contraseña | Aceptado, **completa 0031** |
| [ADR-0035](adrs/0035-el-evento-es-una-senal-y-el-stream-se-filtra-por-rol.md) | El evento es una señal de invalidación, y el stream se filtra por rol | Aceptado, **completa 0031, propaga 0013, precisa 0009** |
| [ADR-0036](adrs/0036-el-hash-de-cada-secreto-lo-decide-su-entropia.md) | El hash de cada secreto lo decide su entropía, y el token tiene ciclo de vida | Aceptado, **completa 0031** |
| [ADR-0037](adrs/0037-alojamiento-y-origen-unico.md) | El sistema corre alojado y con un solo origen | Aceptado, **reemplaza la sección 1 de 0033**, da piso a 0008, precisa 0015 |
| [ADR-0038](adrs/0038-runner-de-pruebas.md) | Vitest, y las pruebas que importan corren contra PostgreSQL real | Aceptado, **completa 0002 y 0003** |
| [ADR-0039](adrs/0039-tipos-sql-del-dinero-y-los-porcentajes.md) | El dinero es `integer` y los porcentajes son puntos básicos | Aceptado, **completa 0011 y 0032** |
| [ADR-0040](adrs/0040-idioma-de-los-identificadores.md) | Los identificadores del dominio van en español | Aceptado, **precisa la regla de idioma**, apoya 0002 |
| [ADR-0041](adrs/0041-transporte-en-desarrollo-local.md) | En desarrollo el proceso escucha en claro, atado a loopback | Aceptado, **precisa 0037** |

## Modelo de datos

Todos los importes son enteros en unidad mínima (ADR-0011). Las cantidades de insumo son enteros en la
unidad base del insumo (gramos, mililitros, unidades).

**El *día* del sistema es el día operativo (ADR-0028): arranca a las 05:00 hora de Lima y dura 24 horas.**
Los instantes se guardan en UTC (`timestamptz`) y el día operativo se **calcula, nunca se persiste**:

```
dia_operativo(instante) = DATE( (instante AT TIME ZONE 'America/Lima') − INTERVAL '5 hours' )
```

Es una **constante del sistema**, no un parámetro: no vive en `ConfiguracionOperativa` —que existe para lo
que no altera importes— ni se versiona, porque cambiarla re-agruparía ventas ya reportadas. Toda
agregación por día pasa por esta función; **ningún `DATE(timestamp)` suelto es válido**, y el que se olvide
falla en silencio con un número plausible que no reconcilia. Vive en un solo lugar de la base.

### Identidad y configuración

- **`Persona`** — nombre, rol (`mesero` | `cocina` | `administrador`), `pin_hash`, `sueldo_fijo`, activo.
  **No hay rol `cajero`.** `pin_hash` solo aplica a `mesero`: el PIN de cocina no es de una persona y vive
  en `CredencialCocina` (ADR-0018). **`/admin` va con usuario y contraseña**, no con PIN: hasheada con KDF de
  memoria dura y sesión de 60 min de inactividad (ADR-0031). Una
  `Persona` de rol `cocina` existe para costos y horarios, no para entrar al sistema.
  El `pin_hash` y la contraseña son secretos de **baja entropía**, así que los dos van con **Argon2id y
  sal única por credencial** (ADR-0036). Un KDF **no vuelve seguro** un PIN de 4 dígitos contra un volcado
  —10⁴ es forzable igual—: rompe la **precomputación masiva**, que es lo que convertía un volcado en todos
  los PINs a la vez. El problema de fondo es del PIN corto y **ADR-0014 ya lo aceptó** con razones físicas.
  La sal por credencial tiene un costo concreto: **no se puede buscar por hash**, así que la regla *"dos
  personas no pueden compartir PIN"* deja de ser un índice único y pasa a ser una comprobación explícita
  contra cada PIN activo al dar de alta.
- **`Dispositivo`** — nombre, rol (`estacion` | `kds` | `cocina`), `token_hash`, `enrolado_en`,
  **`expira_en`**, `revocado_en`. Es la **primera capa de acceso** (ADR-0031): autoriza leer el stream SSE y presentarse como
  esa ruta, y **ninguna acción**. Se enrola desde `/admin`, el token se muestra una sola vez y viaja en
  cookie `httpOnly` — que es lo que `EventSource` sabe enviar sin headers.
  El **valor es de ≥ 128 bits de un CSPRNG** y su hash es **SHA-256 con sal**, no un KDF (ADR-0036): se
  verifica en cada request del stream con 5 pantallas conectadas todo el servicio, y un KDF ahí sería una
  denegación de servicio contra uno mismo. **La elección del hash rápido vale solo bajo esa premisa de
  entropía**: acortar el token rompe la decisión sin que nada falle ni avise.
  `expira_en` son **90 días con renovación automática mientras el dispositivo se use**, así que una
  pantalla en uso nunca vence y un **equipo perdido y apagado caduca solo**. Se puede **rotar el token sin
  re-enrolar** el equipo, que es la salida para la sospecha sin certeza.
- **`CredencialCocina`** — `pin_hash` de **6 dígitos** (ADR-0031), `actualizada_en`, `actualizada_por`. Llave del ciclo del servicio,
  no identidad: se verifica al abrir y cerrar, **nunca** en el marcado (ADR-0018). Entidad propia y no un
  campo de configuración porque es un secreto: no se muestra y se rota por otro motivo.
  Como todo secreto de **baja entropía**, va con **Argon2id y sal única por credencial** (ADR-0036).
- **`Turno`** — **mesero**, estación de apertura, `abierto_en`, `origen_apertura`
  (`marcado` | `primer_login`), `cerrado_en`, `cerrado_por` (`mesero` | `administrador`),
  `cerrado_en_propuesto`, `motivo_cierre_tardio`.
  Es entidad y no campo porque agrupa el efectivo del cierre y **es el registro de horas efectivas**
  (ADR-0020). Cerró la observación #8 de la revisión adversarial anterior, que ya no figura como hallazgo abierto.
  **No es la sesión de estación** (ADR-0014): hay muchas sesiones dentro de un turno, y las horas son del
  turno. Los tres campos de traza sostienen el cierre tardío del administrador (ADR-0024).
  **Invariante:** `cerrado_en` no puede ser posterior al `abierto_en` del siguiente turno del mismo
  mesero, o las horas dejan de ser sumables.
  **Solo del mesero:** cocina no ficha, así que no hay turno de cocina.
- **`HorarioProgramado`** — persona, fecha, hora de inicio y de fin. Planificación: **no** marca asistencia
  y **no** define los días operativos.
- **`CalendarioApertura`** — `vigente_desde`, `patron_semanal`, `excepciones[]` (fecha + abierto|cerrado),
  **`creada_por`** y **`creada_en`**.
  Define los **días operativos**, que son el divisor del prorrateo de costos fijos (ADR-0021). Versionado
  por vigencia y separado de `HorarioProgramado`.
  La autoría es obligatoria por lo que este dato hace: un calendario mal cargado **desplaza toda la
  utilidad en silencio** —30 días declarados contra 26 reales dejan el costo fijo diario 13% bajo y los
  totales del mes siguen cerrando—, es **irreversible** hacia atrás (ADR-0022), y sin autor no hay forma de
  distinguir un error de carga de un cambio deliberado tres meses después. El patrón ya existía en
  `CredencialCocina.actualizada_por` y en `Turno.cerrado_por`; faltaba aplicarlo donde la consecuencia es
  mayor. **`vigente_desde` dice desde cuándo rige; `creada_en` dice cuándo se escribió, y no son lo mismo.**
- **`ServicioCocina`** — `abierto_en`, `cerrado_en` opcional. **Sin persona: nadie firma el inicio ni el
  cierre.** Es la ventana en que el salón puede enviar comida: **sin un servicio abierto el backend rechaza
  toda comanda con `requiere_cocina`**, igual antes de la primera apertura que después del cierre
  (ADR-0019). Bebidas, cobro y cierre de turno siguen funcionando.
  Una fila **por servicio**, no un interruptor: **reabrir no existe**, se inicia uno nuevo — que es como
  queda representada la reapertura excepcional. Normalmente uno por día.
  Abrir y cerrar exigen `CredencialCocina`; cerrar exige además confirmación explícita (ADR-0018).
- **`ConfiguracionCostos`** — `vigente_desde`; salarios flat de cocina y administrativos, costos
  indirectos mensuales, `pct_comision`, `pct_merma`, `pct_igv`, **`creada_por`** y **`creada_en`**.
  Versionada por vigencia, y
  **`vigente_desde` no admite fechas pasadas** (ADR-0022). Misma regla para `CalendarioApertura`, y misma
  autoría obligatoria: los dos son irreversibles hacia atrás y los dos mueven el estado de resultados.
- **`ConfiguracionOperativa`** — `umbral_demora_min`, `inactividad_sesion_min`. Aparte de
  `ConfiguracionCostos` porque no son costos: no alteran importes, así que no se versionan. Los dos siguen
  **sin valor definido**. `bloqueo_mesa_min` **desapareció** con ADR-0017. Editables desde la pantalla de
  parámetros, junto con los porcentajes.

### Menú

- **`Categoria`**
- **`Plato`** — nombre, foto, `precio_venta`, categoría, `disponible`, `motivo_no_disponible`
  (`automatico` | `manual`), **`requiere_cocina`**. El motivo existe porque el `DESIGN.md` muestra el
  plato agotado deshabilitado en la grilla, y el administrador necesita saber si puede reactivarlo a mano.
  `requiere_cocina` decide si el plato se puede vender sin servicio de cocina abierto (ADR-0019). Es una
  marca **manual por plato**: no se deriva de la categoría ni de tener receta (el criterio y su ejemplo,
  en el PRD).
- **`RecetaInsumo`** — plato, insumo, cantidad. El puente entre venta e inventario.
- **`Combo`** — nombre, foto, `precio_venta` propio.
- **`ComboItem`** — combo, plato, cantidad. El combo **no tiene receta propia**: al venderse descuenta
  la receta de cada plato que lo compone. Su disponibilidad se deriva: si algún componente está
  agotado, el combo lo está.

### Inventario

- **`Insumo`** — nombre, `unidad_base`, `stock_minimo_alerta`.
- **`Compra`** — es el **lote**. Insumo, `numero_lote`, cantidad, `precio_pagado_total`,
  `genera_credito_fiscal`, **`costo_costeado_total`**, fecha. **`numero_lote` es la clave de consumo FIFO**
  —orden de registro, un orden
  total sin desempate (ADR-0030)—; **`fecha` es informativa y no ordena nada**, así que ninguna consulta de
  consumo la toca. La marca de crédito fiscal decide si el lote se costea neto (con factura, el IGV se recupera)
  o bruto (sin comprobante).
  **`costo_costeado_total` se persiste, no se deriva** (ADR-0032): es el importe que el consumo FIFO
  reparte entre sus movimientos, y se calcula **una sola vez, al registrar la compra** —neto con crédito
  fiscal, precio pagado completo sin él—. Derivarlo al vuelo lo ataría a `ConfiguracionCostos.pct_igv`,
  que está versionada: una vigencia nueva de IGV le cambiaría el costo a lotes ya consumidos por ventas
  cerradas, que es exactamente lo que ADR-0004 y ADR-0022 prohíben. El único punto de redondeo del IGV de
  compra vive acá.
- **`MovimientoInventario`** — insumo, lote de origen, tipo (`entrada` | `salida` | `ajuste`),
  cantidad, **`costo_aplicado`** (el costo **total** del movimiento, entero en céntimos), origen
  (`compra` | `comanda_preparada` | `merma_registrada` | `ajuste`), referencia. `merma_registrada` cubre
  la merma puntual que el administrador carga a mano (PRD v1.1), distinta del `pct_merma` estimado que
  solo vive en el reporte.
  Append-only. El stock es la suma de los movimientos.
  **No hay costo unitario, y es deliberado** (ADR-0032). El costo por unidad base de un insumo vive por
  debajo del céntimo —un lote de 1200 g a S/ 50,00 son 4,1666 céntimos por gramo—, así que persistirlo
  como entero en céntimos costearía ese gramo a 4 y metería un **4% de error** en la cifra que el
  producto viene a vender. El costo del movimiento se calcula por proporción del lote
  —`redondear(cantidad × costo_costeado_lote / cantidad_lote)`— y solo se persiste el importe final, que
  sí es dinero. El movimiento que **agota** el lote absorbe el saldo monetario restante, de modo que la
  suma de los movimientos de un lote es exactamente su costo. Es la clase de campo que alguien reintroduce
  "para ver el costo por gramo": el costo por gramo se deriva del lote, no se guarda.
- **`Merma`** — insumo, cantidad, `motivo`, `costo_fifo`, fecha. Entidad propia y no un
  `MovimientoInventario` con comentario, por la misma razón que `PerdidaPorAnulacion`: es una **pérdida
  medida con causa**, y el margen la necesita como línea identificable. El `motivo` es obligatorio —
  sin él una merma es indistinguible de un faltante por robo o de una receta mal cargada, que es
  justo lo que el PRD advierte como riesgo.
- **`IncidenciaStock`** — insumo, cantidad faltante, `origen` (`stock_negativo` | `sin_insumo_en_cocina`),
  movimiento o unidad de referencia, resuelta, `modo_regularizacion` (`compra` | `ajuste` | `receta`).
  El modo se registra porque las tres causas tienen implicancias distintas: una compra tardía se corrige
  cargando el lote, un ajuste admite que el libro estaba desalineado, y una receta mal cargada significa
  que **todas** las ventas anteriores costearon mal.
  El origen `sin_insumo_en_cocina` es el que cocina genera al marcar una unidad como *sin insumo*
  (ADR-0016). Los dos orígenes son la misma falla vista desde dos puntas: el sistema creyó que había
  insumo y no había. Que caigan en la misma bandeja es deliberado — el PRD advierte que *"si aparece
  seguido, es señal de recetas mal cargadas o compras registradas tarde"*, y esa señal se pierde si están
  en dos listas separadas.

### Operación

- **`Mesa`** — **solo su número** (ADR-0017). Su estado **no es un campo**: *libre* u *ocupada* se deriva
  de cuántas cuentas tiene en `abierta` o `en_cobro` (ADR-0027). **El predicado es una lista blanca, no
  `<> cerrada`**: con la lista negra, el estado `fusionada` que agregó ADR-0025 se coló solo y dejaba la
  mesa ocupada para siempre. Requiere índice sobre `(mesa, estado)`: la grilla de mesas es la
  lectura más caliente del sistema, con hasta 3 estaciones refrescándola en vivo.
- **`Cuenta`** — mesa, **mesero dueño**, estado (`abierta` | `en_cobro` | `cerrada` | `fusionada`),
  `abierta_en`, `cerrada_en`, `mesa_anterior`, `mesa_cambiada_en`, **`fusionada_en`** (timestamp) y
  **`absorbida_por`** (FK a la cuenta absorbente). Los dos últimos eran un solo campo sobrecargado hasta
  ADR-0027: `fusionada_en` se usaba a la vez como instante y como referencia, y no puede ser las dos cosas. Acumula todas las
  rondas hasta el pago. El estado intermedio es `en_cobro` y no `en_caja`: la cuenta no viaja a otra
  estación.
  **Es la unidad de propiedad, no la mesa** (ADR-0017): unicidad `(mesa, mesero)` mientras esté en
  `abierta` o `en_cobro` (ADR-0027), y **ninguna consulta de autorización mira la mesa** — para abrir, editar o cobrar se mira la
  cuenta y su mesero.
  `abierta_en` y `cerrada_en` sostienen la rotación de mesas y la curva de ventas por hora (ADR-0023).
  `mesa_anterior` y `mesa_cambiada_en` **ya no los lee el KDS** (ADR-0027): esa marca pasó a
  `Comanda.mesa_en_creacion`. Quedan como **historia de la cuenta** —explican por qué la rotación de esa
  mesa se ve rara— y no como fuente de la re-etiquetación.
  **Trampa, ahora desactivada por construcción:** `fusionada` marca la cuenta absorbida, y filtrar por
  `estado <> cerrada` la contaba y duplicaba totales. El predicado vigente es la **lista blanca**
  `estado IN (abierta, en_cobro)` (ADR-0027), así que un estado nuevo queda afuera por omisión en vez de
  colarse solo. La cuenta absorbida **conserva su `mesa`** —es donde ocurrió— y lo que se mueve son sus
  comandas. La fusión es solo
  entre cuentas del mismo mesero, y la resultante conserva el `abierta_en` más antiguo.
- **`Comanda`** — cuenta, **mesero que la tomó** —que con ADR-0017 es **siempre** el dueño de la cuenta,
  porque nadie puede tomar sobre la cuenta de otro; se conserva explícito por ser la base de la
  comisión—, número de ronda, estado (`pendiente` | `terminada` | `anulada`), `creada_en`,
  **`terminada_en`**. `terminada` es terminal y es el paso que **escribe el inventario** (ADR-0006
  refinado por ADR-0016): solo se puede terminar una orden cuando todas sus unidades están resueltas.
  **El estado `demorada` no es un campo**: se **deriva** de `creada_en` + `ConfiguracionOperativa.umbral_demora_min`
  mientras la orden siga `pendiente`. Nadie lo marca, así que no le cuesta un toque a cocina, y no hay
  un estado más que mantener sincronizado.
  **No registra quién la terminó, ni persona ni turno** (ADR-0016): cocina no tiene identidad, así que la
  escritura de inventario es **anónima por diseño**. El costo está declarado en el ADR.
  **`mesa_en_creacion`** guarda la mesa para la que se creó (ADR-0027). Es el snapshot que el KDS compara
  contra la mesa efectiva de su cuenta para tachar la anterior; reemplaza a la regla temporal de ADR-0025,
  que solo cubría *mover* y sobrevive a un segundo cambio de mesa. Mismo patrón que
  `ItemComanda.precio_unitario_snapshot`: guarda lo que era cierto cuando el hecho ocurrió.
  **Una comanda sin ningún ítem que requiera cocina nace `terminada`** (ADR-0026), con
  `terminada_en = creada_en` y sus unidades en `listo`, y escribe su inventario en la misma transacción de
  creación. No es un momento de consumo nuevo: sigue siendo *"se escribe al pasar a `terminada`"*, solo que
  llega ahí sola. Con eso **nunca está `pendiente`**, así que no entra al KDS y no puede trabar el cierre
  de cocina.
  **Un pedido mixto se persiste como dos comandas** —una sin cocina y una de cocina—, de modo que
  `Comanda` **deja de ser uno a uno con la ronda**: todo reporte que cuente comandas tiene que saberlo.
  La comanda nacida terminada **sí tiene autor** —el mesero que la envió—, a diferencia de la de cocina:
  hay dos clases de escritura de inventario y la auditoría por persona cubre solo una (ADR-0026).
- **`ItemComanda`** — comanda, **siempre un plato — nunca un combo** (ADR-0029), `precio_unitario_snapshot`,
  `combo_origen` (FK, nulo si es venta directa) y `combo_descripcion` (snapshot del nombre), estado
  (`pendiente` | `listo` | `anulado` | `sin_insumo`), `listo_en`, `motivo`. **Una fila por unidad:
  `cantidad` es siempre 1.** Dos ceviches en la misma orden son dos filas.
  Es la decisión de modelo que sostiene todo el flujo de cocina (ADR-0016): el cocinero marca y deshace
  **cada unidad**, y la anulación del PRD también es por unidad. La alternativa —una línea con
  `cantidad`, `cantidad_anulada` y `cantidad_preparada`— exige mantener a mano el invariante
  `anuladas + listas ≤ cantidad`, y ese es exactamente el tipo de invariante que alguien rompe. Con una
  fila por unidad no hay nada que romper: un estado por fila y listo.
  Costo: más filas. Una orden de restaurante tiene unidades, no miles, así que no es un problema real.
  La cuenta y el pedido **muestran las unidades agrupadas** —"2 Ceviche clásico"— porque agrupar es
  presentación; el KDS las muestra separadas porque ahí cada una se toca.
  El ítem anulado o sin insumo **no se borra**: queda tachado en la cuenta.
- **`EventoOperacion`** — `secuencia` monotónica, `tipo`, **`alcance`** (a qué rol de dispositivo le
  importa), **`referencia`** (el identificador mínimo para dirigir la invalidación), `fecha`. Alimenta el
  canal SSE y sostiene la reanudación del KDS.
  **No tiene `payload`, y es deliberado** (ADR-0035): el evento es una **señal de invalidación**, no un
  transporte de dominio. Es la aplicación de ADR-0013 —*"el cliente mantiene una caché de consultas que
  los eventos invalidan"*— al registro de eventos, que era donde no había llegado. El cliente recibe la
  señal, invalida y **vuelve a pedir por tRPC**, donde la autorización ya está resuelta; así la
  confidencialidad vive en **un solo lugar** y el canal de tiempo real no puede contradecirla.
  **`alcance` se entrega filtrado por `Dispositivo.rol`**: una pantalla de cocina no recibe ninguna señal
  de cuenta ni de cobro — no las filtra en el cliente, no le llegan. El default de un tipo de evento nuevo
  es el rol **más restrictivo**, por el mismo criterio de lista blanca de ADR-0027.
  La señal de `estacion` dice *"cambió algo en cuentas"*, **nunca** qué cuenta de qué mesero: la
  granularidad la resuelve el refetch, que devuelve solo lo que ese mesero puede ver. Con eso la
  suscripción sigue **sin depender de la persona** (ADR-0031) y la grilla muestra los agotados antes del
  PIN.
  Es el campo que alguien reintroduce "para no pagar el viaje de red": el dato se pide, no se empuja.

### Dinero

- **`Venta`** — cuenta, **`turno`**, `cerrada_en`, `total_neto`, `total_igv`, `total_bruto`, **mesero de
  la cuenta**. Neto e IGV se guardan separados porque la estación los muestra desglosados al cobrar
  (`DESIGN.md`) y porque la comisión se calcula sobre el neto. El vínculo a `Turno` es lo que hace
  computable el cierre: sin él, "ventas en efectivo de este turno" habría que deducirlo de un rango de
  horas, y un rango a mano no sobrevive a un turno que se estira. Las propinas heredan el turno por su
  venta, así que no necesitan el campo.
- **`ItemVenta`** — snapshot inmutable (ADR-0004): descripción, `precio_unitario_neto`, `igv_unitario`,
  cantidad, **`costo_fifo_snapshot`**, `combo_origen` y `combo_descripcion`. Nunca se recalcula.
  **Un combo vendido produce una fila por componente y ninguna fila propia** (ADR-0029), con el precio ya
  repartido proporcional a los precios de lista del momento. Por eso `SUM(ItemVenta)` da el total de la
  venta **sin excluir nada**: el doble conteo es imposible, no improbable. El comprobante y la cuenta
  reagrupan por `combo_origen` para mostrar el combo — agrupar es presentación.
  **Residuo del reparto:** se trunca cada componente y el sobrante se asigna de a un céntimo en orden
  descendente de precio de lista, con empate por id de plato. La suma cierra por construcción.
- **`Pago`** — venta, método (`efectivo` | `pos`), `pos_operador` opcional
  (`niubiz` | `yape` | `otro`), monto, si es parcial, comensal opcional. Dos ejes y no uno porque los
  dos consumidores piden cosas distintas: el **cierre de turno** necesita exactamente dos baldes
  —efectivo contra POS, porque solo el efectivo se entrega físicamente— y el **dashboard** necesita el
  detalle por operador para "ventas por método de pago". Colapsarlos en una sola lista obligaría al
  cierre a saber cuáles de esos valores son "de tarjeta". Soporta la división de cuenta sin
  restricciones, por ítem o por monto.
- **`Propina`** — venta, **mesero**, monto, origen (`efectivo` | `pos`), estado
  (`pendiente` | `liquidada`). El origen importa y ahora decide quién tiene la plata: la propina en
  efectivo ya está **en el bolsillo del mesero** al cierre y se descuenta de lo que entrega; la de POS
  entró a la cuenta del negocio y se le liquida después. No atraviesa el estado de resultados.
- **`LiquidacionPropina`** — mesero, monto, fecha.
- **`Comision`** — venta, mesero, `base_neta`, monto. Calculada al cerrar la venta y congelada.
- **`Comprobante`** — venta, tipo (`boleta` | `factura`), serie, correlativo, estado, y los datos del
  receptor **según el tipo**: `boleta` acepta DNI, nombre y dirección; `factura` **exige** RUC, razón
  social y dirección fiscal. Los campos y su obligatoriedad salen del prototipo validado de la
  estación, que ya distingue los dos formularios. Modelado como entidad de primera clase aunque la v1
  no emita, para que un emisor futuro no obligue a rediseñar ventas ni reportes.
- **`CierreTurno`** — turno, mesero, `ventas_efectivo`, `ventas_pos`, `propinas_efectivo`,
  `propinas_pos`, `a_entregar`, `cerrado_en`. **Reemplaza al `Arqueo`** (PRD v1.2): no hay
  `efectivo_esperado` contra `efectivo_real` ni diferencia, porque sin caja central no hay fondo que
  contar ni vuelto centralizado. `a_entregar = (ventas_efectivo + propinas_efectivo) − propinas_efectivo`,
  que es idéntico a `ventas_efectivo`; se persiste igual —y no se deriva— porque es la cifra que el
  mesero firma al entregar el dinero, y un cambio posterior de la fórmula no debe reescribir un cierre
  ya hecho. Los cuatro subtotales se guardan porque el prototipo los muestra como líneas expandibles
  por mesa.
- **`PerdidaPorAnulacion`** — ítem anulado tras preparación, `costo_fifo`, `motivo` **obligatorio**,
  **`mesero`** y **`anulada_en`**. Línea propia del margen de contribución.
  **El autor no es opcional, y es el control que sostiene la decisión de eliminar el cajero.** El `PRD.md`
  aceptó perder la separación de funciones apoyándose en *"control por atribución"*, y la anulación es la
  única operación que puede hacer desaparecer dinero ya cobrado: el mesero cobra en efectivo, anula la
  unidad antes de cerrar la cuenta, y esa venta nunca existe — así que tampoco falta en su `CierreTurno`,
  que se calcula sobre ventas registradas. Sin `mesero` la atribución no cubre la operación que más la
  necesita.
  El `motivo` obligatorio ya lo pedía el `PRD.md` (*"anulación de pedido con motivo registrado"*) y sigue
  el mismo argumento que la `Merma`: sin él, una anulación es indistinguible de un faltante por robo.

## Criterios de aceptación por flujo

### Acceso: dispositivo, persona y llave de servicio (ADR-0031)

- [ ] Cada una de las 5 pantallas se **enrola una vez** desde `/admin` y recibe un token de dispositivo; el token se muestra **una sola vez** y se persiste hasheado.
- [ ] El token viaja en cookie `httpOnly` de larga duración, que `EventSource` envía sola: **la suscripción al canal SSE no requiere headers ni sesión de persona**.
- [ ] Una suscripción al stream **sin dispositivo enrolado se rechaza**. Ninguna de las 5 vistas recibe eventos sin credencial de dispositivo.
- [ ] El dispositivo **no autoriza ninguna acción**: marcar, vender, cobrar, abrir o cerrar el servicio y gestionar exigen su propia capa. Un dispositivo enrolado que intente escribir sin la capa que corresponde **falla en el servidor**.
- [ ] Revocar un dispositivo desde `/admin` **corta su stream** sin afectar a los demás.
- [ ] **`/admin` entra con usuario y contraseña**, hasheada con KDF de memoria dura (Argon2id o bcrypt); nunca con PIN y nunca con un hash rápido. La sesión vive en cookie `httpOnly` y expira a los **60 minutos de inactividad**.
- [ ] El **PIN de cocina son 6 dígitos** y solo se pide al abrir y cerrar el servicio (ADR-0018). El del mesero sigue siendo de 4 (ADR-0014).
- [ ] **5 intentos fallidos bloquean el dispositivo 60 s**, y cada bloqueo siguiente duplica la espera con tope de 15 min. Un acierto reinicia el contador.
- [ ] El bloqueo del **PIN** es **por dispositivo, no por cuenta**: una estación bloqueada **no afecta a las otras dos**, y ninguna cuenta queda inutilizable desde otra pantalla.
- [ ] El bloqueo alcanza **solo al pedido de PIN o contraseña**. **Marcar unidades en cocina nunca se bloquea**: un lockout no puede dejar a la cocina sin poder cocinar.
- [ ] Ni el PIN ni la contraseña revelan si el valor existe: el error es el mismo para inválido y para inexistente.

**Transporte cifrado y atributos de sesión (ADR-0033)**

- [ ] **Todo el tráfico va sobre TLS**, incluido el canal SSE. El backend **no escucha en claro**: una petición HTTP no se redirige, se rechaza — una redirección deja la primera petición viajando con su cookie adentro.
- [ ] El certificado **lo emite la plataforma de alojamiento** sobre su propio dominio (ADR-0037). **No existe CA propia del local**, y ninguna pantalla necesita tener instalado un certificado raíz para operar.
- [ ] La cookie de dispositivo lleva `Secure`, `HttpOnly` y **`SameSite=Lax`** — `Lax` y no `Strict` porque tiene que sobrevivir a la navegación con que arranca cada pantalla al encenderse.
- [ ] La cookie de sesión de `/admin` lleva `Secure`, `HttpOnly` y **`SameSite=Strict`**: no existe navegación entrante legítima desde otro sitio hacia el panel.
- [ ] **Toda mutación tRPC valida la cabecera `Origin`** y rechaza la que no coincida con el origen del sistema. Es red de seguridad, no control principal: `SameSite` ya cubre el caso, pero depende de un default del navegador que el sistema no controla.
- [ ] Una captura de tráfico durante un login, un cobro y una suscripción al stream **no contiene** el PIN, el token de dispositivo ni la cookie de sesión en claro.
- [ ] Una escritura de `ConfiguracionCostos` o `CalendarioApertura` emitida desde otro origen **se rechaza**. Es el vector con daño permanente: ADR-0022 prohíbe corregir hacia atrás, así que una vigencia falsificada no se puede deshacer.

**Alojamiento y origen único (ADR-0037)**

- [ ] **La SPA y la API tRPC se sirven desde el mismo origen.** No existe un origen separado para el front: ninguna petición del cliente al backend es *cross-site*, que es la condición bajo la cual `SameSite=Lax` y `SameSite=Strict` (ADR-0033) funcionan sin excepción.
- [ ] **Ningún paso del enrolamiento instala un certificado.** Enrolar un dispositivo es recibir su token una sola vez (ADR-0031) y nada más: no hay CA propia ni certificado raíz que distribuir a las 5 pantallas.
- [ ] El proceso del backend **no expone ningún puerto en claro a ninguna red**. Recibe tráfico ya descifrado desde el borde de la plataforma, y el origen público **rechaza** —no redirige— toda petición sin cifrar.
- [ ] Tras un período de inactividad que duerma la instancia o la base, **la reconexión del stream con `Last-Event-ID` recupera los eventos perdidos** sin intervención manual y sin dejar una pantalla mostrando estado viejo (ADR-0009).
- [ ] Una caída del enlace a internet **se comporta exactamente como el corte de red de ADR-0015**: la estación avisa y bloquea el envío, y ninguna comanda queda a medias ni se pierde en silencio.

**Tipos, idioma de los identificadores y transporte en desarrollo (ADR-0038 a ADR-0041)**

- [ ] Los importes se guardan como **`integer` en céntimos** y los porcentajes como **enteros en puntos básicos** (18% es `1800`). Ninguna columna de dinero ni de porcentaje es de punto flotante (ADR-0039).
- [ ] Aplicar un porcentaje **no introduce un segundo redondeo**: la división por 10 000 ocurre **dentro** de la única función de redondeo, en su único punto de aplicación (ADR-0032, ADR-0039).
- [ ] Los identificadores del dominio —tablas, columnas, campos del contrato tRPC y valores de enumeración— son **idénticos en base, backend y cliente**, y coinciden **literalmente** con los nombres de este documento (ADR-0040).
- [ ] Las pruebas que ejercen **concurrencia, FIFO o dinero corren contra PostgreSQL real**, nunca contra un doble: un bloqueo de fila no se puede simular, y una prueba contra un mock prueba el mock (ADR-0003, ADR-0038).
- [ ] En desarrollo el proceso **escucha solo en `127.0.0.1`**. Un bind a `0.0.0.0` es un defecto, no una comodidad: expone en claro las credenciales de las tres capas en cualquier red donde esté la máquina (ADR-0041).

**Ancla del límite de intentos y qué exige dispositivo (ADR-0034)**

- [ ] **Verificar un PIN exige cookie de dispositivo válida.** Sin ella la llamada se rechaza **antes de comparar el PIN**, y el rechazo es indistinguible del PIN inválido. Cubre el PIN del mesero y el de cocina: las dos credenciales que no identifican a nadie.
- [ ] **`/admin` no exige dispositivo**, y su contador va **por cuenta y por IP de origen**. Misma escalera —5 intentos, 60 s, duplicación con tope de 15 min, reinicio con acierto—, distinto ancla: usuario y contraseña sí identifican una cuenta contra la cual contar.
- [ ] Existe un **contador de respaldo por IP** para todo intento sin dispositivo: ninguna implementación puede quedar sin límite alguno.
- [ ] 200 intentos automatizados de PIN sin cookie de dispositivo **no producen ninguna sesión válida** y quedan limitados por el contador de respaldo.
- [ ] Los **tres contadores** —dispositivo, cuenta e IP— se verifican por separado. Un contador mal anclado no falla: simplemente no protege, y el error es silencioso.
- [ ] `Dispositivo.rol` sigue siendo `estacion | kds | cocina`: **no existe el rol `admin`** y `/admin` no es un suscriptor del canal SSE.

**Alcance del canal SSE (ADR-0035)**

- [ ] **Ningún evento lleva dominio.** `EventoOperacion` no tiene `payload`: el cliente recibe la señal, invalida su consulta y **vuelve a pedir por tRPC**. La confidencialidad vive en un solo lugar, y el canal de tiempo real no puede contradecirla porque no transporta nada que contradecir.
- [ ] **El stream se filtra por `Dispositivo.rol` en el servidor.** Un dispositivo con rol `kds` o `cocina` suscripto durante un cobro completo **no recibe ninguna señal** de cuenta, pago ni cierre de turno. No las descarta en el cliente: no le llegan.
- [ ] La señal que reciben las estaciones dice **"cambió algo en cuentas"**, nunca qué cuenta de qué mesero. La granularidad la resuelve el refetch, que devuelve solo lo que ese mesero puede ver — o nada si no hay sesión abierta.
- [ ] **La suscripción sigue sin depender de la persona** (ADR-0031): con la estación en la pantalla de PIN y sin nadie identificado, la grilla recibe igual los cambios de disponibilidad y el estado del servicio de cocina.
- [ ] **La reanudación respeta el mismo filtro que la suscripción en vivo.** Un dispositivo no puede recuperar por `Last-Event-ID` lo que no podía recibir en vivo.
- [ ] Un `Last-Event-ID` **anterior al horizonte de archivado** devuelve *resincronizá todo* y el cliente refetchea. Purgar el registro de eventos **no pierde ningún dato**: el dominio lo tiene.
- [ ] Una **ráfaga** de eventos del mismo tipo se agrupa: 20 comandas seguidas no disparan 20 refetches de la misma cola. Es el costo que ADR-0013 declaró y que ahora también paga el KDS.
- [ ] Un tipo de evento nuevo sin `alcance` definido **no se entrega a nadie**: el default es el rol más restrictivo, nunca el más amplio (mismo criterio de lista blanca que ADR-0027).

**Hash de los secretos y ciclo de vida del token (ADR-0036)**

- [ ] **Los tres secretos de baja entropía** —PIN de mesero, PIN de cocina y contraseña de `/admin`— se hashean con **Argon2id** y **sal única por credencial**. Ninguno con un hash rápido.
- [ ] El **token de dispositivo** es de **≥ 128 bits de un CSPRNG** y se hashea con **SHA-256 con sal**, no con KDF: se verifica en cada request del stream y un KDF ahí sería una denegación de servicio contra uno mismo.
- [ ] **Dos credenciales sembradas con el mismo valor producen hashes distintos.** Verificar un PIN cuesta por encima de un umbral medible (> 50 ms); verificar un token de dispositivo, no.
- [ ] Dos enrolamientos consecutivos producen tokens **sin ninguna relación deducible**.
- [ ] `Dispositivo.expira_en` son **90 días con renovación automática mientras el dispositivo se use**. Una pantalla en uso diario nunca vence; una apagada caduca sola.
- [ ] Un **token vencido se rechaza** en la suscripción al stream aunque el dispositivo no esté revocado.
- [ ] `/admin` ofrece **rotar el token sin re-enrolar** el equipo, distinguido en la interfaz de la revocación: elegir mal en una pérdida real decide si el equipo robado sigue leyendo el stream.
- [ ] La regla *"dos personas no pueden compartir PIN"* se verifica **comprobando contra cada PIN activo** al dar de alta: con sal por credencial no existe el índice único que antes la resolvía.

**Política de la contraseña de `/admin` (SEC-09)**

- [ ] La contraseña nueva exige **mínimo 12 caracteres**. Rotar a una más corta **falla, con el motivo explicado**.
- [ ] Rotar a la **misma contraseña sembrada** falla: la rotación obligatoria del primer ingreso no se puede cumplir en el papel sin cumplirse de hecho.
- [ ] La contraseña se contrasta contra una **lista de contraseñas comunes** y se rechaza si figura. Es el único secreto fuerte del sistema y **no tiene segundo factor** (fuera de alcance, ADR-0031).

**Arranque del sistema (ADR-0031, abierto por ADR-0034)**

- [ ] La migración inicial crea **un administrador y nada más**: su contraseña se genera al sembrar, se muestra **una sola vez** y **debe rotarse en el primer ingreso**.
- [ ] No se siembra ninguna `CredencialCocina` ni ningún `Dispositivo`: los define el administrador. **Tampoco un dispositivo de arranque** — no hace falta, porque `/admin` no exige uno (ADR-0034).
- [ ] **La cadena de arranque se recorre entera desde una base vacía**, sin modo de primer arranque ni excepción temporal: el administrador sembrado entra a `/admin`, rota su contraseña, enrola las 5 pantallas —token más certificado raíz (ADR-0033)— y define la `CredencialCocina`. Recién ahí el salón puede vender comida.
- [ ] La **revisión de pendientes** lista *PIN de cocina sin definir* y *ningún dispositivo enrolado*, junto a los platos sin receta y los insumos sin compras.
- [ ] Desde una base vacía, el escenario simulado del PRD **recorre el ciclo completo sin ninguna intervención manual fuera del sistema**.

### Identificación y toma de pedido

- [ ] Un PIN válido abre sesión; uno inválido muestra badge `critical` con icono y texto, sin revelar si el PIN existe.
- [ ] La sesión se cierra automáticamente al enviar la comanda a cocina y tras el periodo de inactividad configurado.
- [ ] Confirmar un pedido con la sesión expirada falla y no crea comanda.
- [ ] La comanda registra mesa, mesero que la tomó y hora, y queda asociada a **la cuenta propia** del mesero en esa mesa.
- [ ] Una segunda ronda sobre la misma cuenta crea una comanda nueva y acumula en la misma cuenta.
- [ ] Con la estación sin conexión, el envío se bloquea con aviso y no queda nada en cola local.

**Turno y horas efectivas (ADR-0020)**

- [ ] La pantalla de PIN ofrece **marcar ingreso**, que abre el turno con `origen_apertura = marcado` sin necesidad de tomar ningún pedido.
- [ ] Si el mesero no marcó ingreso, su **primer login del día** abre el turno con `origen_apertura = primer_login`. Nunca hay actividad sin turno.
- [ ] Un mesero que entra, no toma ningún pedido y no cobra nada **igual tiene turno abierto y horas efectivas**. Un turno sin ninguna venta es un turno válido.
- [ ] Un mesero con turno abierto no abre un segundo turno: la acción de marcar ingreso no se ofrece.
- [ ] Las horas efectivas de un turno son `cerrado_en − abierto_en`, y un turno sin cerrar **no reporta horas**: se muestra como turno abierto, no como cero ni como un número que sigue creciendo en un reporte.
- [ ] Cerrar sesión en la estación **no** cierra el turno ni corta las horas.

**Turno sin cerrar (ADR-0024)**

- [ ] Un mesero con un turno abierto de una fecha anterior **entra con normalidad** y se le abre un turno nuevo. Nada lo bloquea ni lo obliga a resolver el anterior.
- [ ] Los turnos abiertos de fechas anteriores aparecen en la **bandeja del administrador**, con contador en la navegación.
- [ ] Al cerrar uno, el sistema **propone** `cerrado_en_propuesto` = hora de la última actividad de ese mesero, y el administrador puede aceptarla o corregirla.
- [ ] Cerrar sin motivo **falla**: `motivo_cierre_tardio` es obligatorio cuando cierra el administrador.
- [ ] Una hora de cierre **posterior al `abierto_en` del siguiente turno del mismo mesero se rechaza**, con el motivo explicado: dejaría dos turnos superpuestos y las horas dejarían de ser sumables.
- [ ] El `CierreTurno` resultante se marca como **no firmado por el mesero** y se muestra distinto del firmado, en la bandeja y en el dashboard.
- [ ] Ningún reporte de horas ni de efectivo suma cierres firmados y cierres tardíos sin distinguirlos.

**Cambio de mesa y fusión de cuentas (ADR-0025)**

- [ ] Mover una cuenta a otra mesa arrastra **todos** sus ítems y comandas, y escribe `mesa_anterior` y `mesa_cambiada_en`.
- [ ] La mesa de origen vuelve a **libre sola** si no le quedan otras cuentas: no hay ninguna acción de liberar.
- [ ] Mover una cuenta a una mesa donde ese mesero **ya tiene** una cuenta abierta se ofrece como **fusión**, no como error.
- [ ] El KDS muestra la mesa nueva **con la anterior tachada al lado** en toda comanda **pendiente** cuya `mesa_en_creacion` difiere de la mesa efectiva de su cuenta (ADR-0027). Una orden terminada no se re-etiqueta.
- [ ] **La misma regla cubre la fusión**, sin ningún caso especial: las comandas absorbidas pasan a la cuenta sobreviviente, su mesa efectiva cambia, y el KDS las tacha igual que en un movimiento.
- [ ] Una cuenta movida **dos veces** (6 → 5 → 9) sigue mostrando **6** como mesa tachada, no 5: el snapshot no se pisa.
- [ ] Una cuenta `fusionada` **no cuenta para el estado de la mesa** ni ocupa el índice único: la mesa de origen vuelve a **libre** y ese mesero puede abrir una cuenta nueva ahí.
- [ ] La cuenta absorbida **conserva su `mesa`**: el sistema puede decir en qué mesa se abrió y se atendió, aunque sus comandas hayan pasado a otra.
- [ ] Toda consulta de cuentas abiertas usa `estado IN (abierta, en_cobro)` — **lista blanca, nunca `<> cerrada`** (ADR-0027).
- [ ] El cambio llega al KDS en **≤ 3 segundos**, el mismo presupuesto que una comanda nueva.
- [ ] Fusionar dos cuentas **del mismo mesero** conserva ítems, comandas y el `abierta_en` más antiguo; la absorbida queda en `fusionada` con su `fusionada_en`.
- [ ] Fusionar cuentas de **meseros distintos falla en el servidor**, no solo en la interfaz.
- [ ] Una cuenta `fusionada` **no aparece** en cuentas abiertas, ni en el cierre de turno, ni en ningún total del dashboard.
- [ ] Una cuenta `en_cobro` o `cerrada` no se puede mover ni fusionar.

### Concurrencia entre estaciones

- [ ] Dos meseros abren cuenta en la misma mesa desde estaciones distintas y se crean **dos cuentas independientes**. Ninguna acción falla y no hay bloqueo, aviso de conflicto ni toma forzada.
- [ ] Un mesero **no ve** los ítems ni el total de la cuenta de otro, y la interfaz no le ofrece ninguna acción sobre ella.
- [ ] Cobrar o editar la cuenta de otro mesero **falla en el servidor**, no solo en la interfaz: la autorización se resuelve contra `Cuenta.mesero`, no contra la mesa.
- [ ] Un mesero no puede tener dos cuentas abiertas en la misma mesa: la segunda apertura cae sobre la existente para agregar o cobrar.
- [ ] La mesa figura **ocupada** mientras tenga al menos una cuenta no cerrada, y vuelve a **libre** solo cuando se cierra la última.
- [ ] Cobrar una de dos cuentas de la misma mesa **no** libera la mesa.
- [ ] Comisión, propina y efectivo de una cuenta se atribuyen siempre a su mesero dueño, sin ningún camino alternativo.

### Cocina (KDS)

- [ ] La comanda confirmada aparece en el KDS en ≤ 3 segundos.
- [ ] El orden es FIFO estricto por hora de creación y ninguna interacción lo reordena.
- [ ] Con corte de red forzado y 20 comandas emitidas durante el corte, al reconectar se muestran las 20, en orden, sin duplicados.
- [ ] Reiniciar el proceso del backend durante el corte no cambia el resultado anterior.
- [ ] El indicador de conexión refleja el estado real (en línea / reanudando / sin conexión).
- [ ] La pantalla de pared **no pide identificación en ningún momento** y no ofrece ninguna acción que escriba: se abre y queda abierta todo el servicio (ADR-0016).
- [ ] La pantalla de pared no se desloguea ni se bloquea por inactividad, porque no tiene sesión.
- [ ] Cada unidad se muestra en su **propia fila**: dos unidades del mismo plato son dos filas, nunca "2 ×". El KDS es la superficie donde cada unidad se toca por separado.
- [ ] Cada orden muestra mesa, número de pedido, hora, mesero que la tomó y el estado de cada una de sus unidades.
- [ ] Una orden `pendiente` cuyo `creada_en` excede `ConfiguracionOperativa.umbral_demora_min` se muestra como **demorada** con `warning`, icono de reloj y texto. El estado es **derivado**: nadie lo marca y no existe como campo.
- [ ] Una orden terminada desaparece de la cola activa y queda consultable en el historial.

### Estación de cocina — marcado en dos pasos

- [ ] La estación **no pide identificación para marcar**: ni al marcar una unidad como lista, ni al deshacerla, ni al terminar una orden, ni al consultar el historial (ADR-0016). El **ciclo del servicio** —abrir y cerrar— es la excepción y sí exige el PIN de cocina (ADR-0018, ver *Apertura del servicio de cocina*).
- [ ] Iniciar el servicio queda registrado como `ServicioCocina` **sin persona asociada**: el PIN es la llave del servicio y **no identifica a nadie**, así que la fila no lleva autor (ADR-0018).
- [ ] Con el servicio iniciado, cualquier cocinero marca cualquier unidad de cualquier orden, sin ningún paso previo.
- [ ] Sin servicio iniciado, la estación **no ofrece marcar** y dice qué falta; no lo muestra deshabilitado sin explicación.
- [ ] **Paso 1 — unidad lista.** Marcar una unidad como lista **no escribe ningún movimiento de inventario** y guarda `listo_en`.
- [ ] **Deshacer** devuelve la unidad a `pendiente` y **no escribe nada en el libro de movimientos**: no hay reversa porque no hubo consumo (ADR-0005 sigue append-only sin excepciones).
- [ ] Deshacer está disponible sobre cualquier unidad lista mientras la orden **no** esté terminada.
- [ ] **Paso 2 — orden terminada.** La acción de terminar solo se ofrece cuando **todas** las unidades de la orden están resueltas (`listo`, `anulado` o `sin_insumo`).
- [ ] Terminar la orden escribe **todos** los movimientos de inventario de sus unidades listas, en una sola transacción, y fija su costo FIFO (ADR-0006 refinado por ADR-0016).
- [ ] Terminar una orden es **irreversible** y no hay deshacer después. La confirmación muestra la orden completa antes de escribir.
- [ ] Las unidades `anulado` y `sin_insumo` **no generan movimiento de inventario** al terminar la orden.
- [ ] La orden terminada **no registra autoría**: solo `terminada_en`. Es anónimo por diseño y está declarado como costo, no como omisión.

### Unidad que no se puede preparar

- [ ] La estación permite marcar una unidad como **sin insumo**, con motivo obligatorio. Es la única acción de cocina que no es marcar avance.
- [ ] La unidad queda `sin_insumo`: no descuenta inventario, no suma a la venta ni a la comisión del mesero.
- [ ] Se **notifica al mesero de esa mesa** para que pueda hablar con el cliente y ofrecerle algo a cambio.
- [ ] Se crea una `IncidenciaStock` con origen `sin_insumo_en_cocina`, en la **misma bandeja** del administrador donde caen los desfases de stock.
- [ ] Una unidad `sin_insumo` cuenta como resuelta: **destraba el cierre de cocina**, que es la razón por la que esta acción existe.

### Historial de órdenes terminadas

- [ ] El cocinero accede desde su estación al historial de órdenes terminadas, sin identificarse.
- [ ] Cada entrada muestra qué se cocinó unidad por unidad, la mesa, el número de pedido, el mesero que lo tomó y la hora de creación y de terminación.
- [ ] El historial es **solo lectura**: no permite deshacer, reabrir ni editar una orden terminada.
- [ ] El historial cubre al menos el servicio en curso; una orden terminada aparece en él inmediatamente después de terminarse.

### Apertura del servicio de cocina

- [ ] Antes del inicio, la pantalla de pared muestra un estado explícito de **cocina sin iniciar**, no una pantalla vacía: vacía, caída y sin iniciar se ven igual y no son lo mismo. **Sin contador de comandas en espera**, porque con el servicio cerrado esa cola no puede existir (ADR-0019).
- [ ] Abrir el servicio **exige el PIN de cocina**; un PIN inválido no abre nada y no revela si existe (ADR-0018).
- [ ] Una comanda con algún plato que requiere cocina, enviada **antes** del inicio del servicio, **se rechaza en el servidor** con motivo `servicio_no_abierto` y la lista de ítems que la bloquearon. No se encola ni se persiste nada.
- [ ] El comportamiento antes de abrir y después de cerrar es **idéntico**: ningún criterio distingue los dos estados.
- [ ] Iniciado el servicio, la cola aparece completa y en orden FIFO.
- [ ] Iniciar dos veces no crea dos servicios: si ya hay uno abierto, la acción no se ofrece.
- [ ] Tras un cierre, volver a abrir el mismo día **crea un `ServicioCocina` nuevo** y el anterior conserva su `cerrado_en`. Es la reapertura excepcional del PRD, y no necesita un estado propio.

### Cierre de cocina

- [ ] La estación ofrece **Cerrar cocina** mientras haya un servicio abierto. La acción pide **confirmación explícita** y después el **PIN de cocina** — dos pantallas, y es la única acción de la estación que las tiene (ADR-0018). El PIN no identifica a nadie: solo encarece la acción que corta la venta de comida de todo el salón.
- [ ] **Cerrar con órdenes pendientes es imposible**, no una advertencia: la acción queda bloqueada, lista las órdenes que faltan por mesa, y solo se habilita cuando todas están terminadas. Con eso el caso borde del PRD *"comanda que queda sin marcar como preparada al cierre del turno"* **no puede existir**.
- [ ] **Sin servicio abierto**, el backend **rechaza la comanda entera** si contiene algún plato con `requiere_cocina`, sea de una mesa nueva o de una ronda sobre una cuenta abierta. El rechazo es atómico: no se persiste nada y la cuenta queda intacta (ADR-0019).
- [ ] El rechazo devuelve un motivo **reconocible por el cliente** (`servicio_no_abierto`) y **qué ítems la bloquearon**, para que la estación pueda ofrecer la salida correcta en vez de un error genérico.
- [ ] Enviar solo los ítems que no requieren cocina es una **segunda acción explícita del mesero**, no una división automática del servidor. Un envío nunca tiene éxito parcial.
- [ ] Los platos con `requiere_cocina` en falso **se siguen vendiendo** con la cocina cerrada, y **se puede abrir mesa nueva**: una mesa que solo toma bebida es una venta legítima.
- [ ] El rechazo ocurre en el **servidor**, no solo en la interfaz: una comanda enviada en el instante exacto del cierre se rechaza igual (ADR-0013).
- [ ] Con la cocina cerrada, **el cobro de una mesa abierta sigue funcionando**, y también el cierre de turno del mesero. Los dos cierres son independientes y ninguno espera al otro.
- [ ] La cocina cerrada se refleja en las 3 estaciones en **≤ 5 segundos**, el mismo presupuesto que el plato agotado.
- [ ] Con la cocina cerrada, la grilla del mesero deshabilita los platos que requieren cocina con motivo visible, y deja habilitados los que no. No oculta: deshabilita, igual que el plato agotado.
- [ ] **Un servicio por día** como operación normal: abre con el negocio y cierra con el negocio. Cerrar y volver a abrir sigue siendo posible y crea un `ServicioCocina` nuevo — es la reapertura excepcional, no el turno de la cena.
- [ ] Entre dos servicios del mismo día el comportamiento es idéntico al de la cocina cerrada: no es un estado distinto.

### Contingencia por caída del KDS

- [ ] Si la pantalla de pared queda fuera de servicio, la **estación de cocina** muestra la cola completa en orden FIFO y la cocina completa un servicio entero sin salir de la cocina.
- [ ] La estación de cocina muestra la cola con la escala tipográfica del KDS, no con la suya de marcado.
- [ ] Como último recurso, la cola es consultable desde una estación del mesero, con aviso de que esa estación queda ocupada mientras se consulta.

### Inventario y costeo FIFO

- [ ] **Terminar una orden** genera movimientos de salida por cada insumo de la receta de cada una de sus unidades listas. Marcar una unidad como lista **no** genera ninguno (ADR-0016).

**Ítems que no requieren cocina (ADR-0026)**

- [ ] Una comanda **sin ningún ítem** con `requiere_cocina` nace en estado `terminada`, con `terminada_en = creada_en` y sus `ItemComanda` en `listo`.
- [ ] Esa comanda **escribe sus movimientos FIFO en la misma transacción en que se crea**, por el mismo camino que usa el cierre de una orden de cocina. No existe un segundo camino de escritura de inventario.
- [ ] Vender una bebida con receta **baja su stock**, y al llegar a cero **dispara el agotado automático** en las 3 estaciones dentro del mismo presupuesto de 5 segundos que cualquier otro plato.
- [ ] El `costo_fifo_snapshot` de un ítem sin cocina se llena igual que el de un plato de cocina: la bebida **entra** en *platos más rentables* y en la matriz de ingeniería de menú, y **nunca** se reporta con costo cero.
- [ ] Una comanda nacida `terminada` **no aparece en el KDS** ni en la cola activa, y **no bloquea el cierre de cocina**. No hace falta ningún filtro por `requiere_cocina` en el KDS: la comanda nunca está `pendiente`.
- [ ] Un pedido **mixto** enviado con la cocina abierta se persiste como **dos comandas** —una sin cocina en `terminada`, una de cocina en `pendiente`—, y el mesero ejecuta **una sola acción** y recibe **un solo resultado**. La división nunca se le muestra como dos envíos.
- [ ] Si en el mismo envío concurren rechazo y división, **manda el rechazo**: primero se rechaza atómicamente (ADR-0019, nada se persiste) y la división solo se aplica sobre lo que el mesero decida reenviar.
- [ ] Anular una unidad sin cocina **después de enviada** registra **pérdida por anulación** con su costo FIFO, igual que una unidad de una orden ya terminada. La corrección es un **movimiento de ajuste** desde la bandeja de incidencias; **no** hay reversa (ADR-0005 sigue append-only).
- [ ] El movimiento de inventario de una comanda sin cocina **queda atribuido al mesero que la envió**. El de una orden de cocina sigue siendo anónimo: son dos clases de escritura y ningún reporte de auditoría puede presentarlas como una sola.
- [ ] Los movimientos consumen los lotes por `numero_lote` ascendente —el primero registrado primero—; al agotarlo, continúan con el siguiente (ADR-0030).
- [ ] La `referencia` del movimiento apunta a la **unidad de `ItemComanda`** que lo causó, que es la granularidad más fina disponible y la que hace computable el costo por plato.
- [ ] El costo de una unidad es la **suma de sus movimientos**, no un costo unitario único: los 180 g de pescado de un ceviche pueden salir 100 g de un lote y 80 g del siguiente, a precios distintos. `ItemVenta.costo_fifo_snapshot` guarda esa suma.
- [ ] Un lote con crédito fiscal se costea a su precio neto; uno sin crédito fiscal, al precio pagado completo.
- [ ] Vender un combo genera exactamente los mismos movimientos que vender sus componentes por separado.
- [ ] Dos órdenes terminadas simultáneamente que consumen el mismo insumo producen movimientos consistentes: la suma consumida es exacta y ningún lote se consume dos veces.
- [ ] Si el stock no alcanza, la operación se completa igual, el stock queda negativo, se registra una incidencia y el costeo usa el precio del último lote conocido.
- [ ] Un insumo sin ninguna compra registrada marca el plato como no costeable en vez de asumir costo cero.
- [ ] El stock de un insumo es siempre igual a la suma de sus movimientos: **no existe un campo de stock**.

### Anulación

- [ ] La anulación es **por unidad**: anular una de dos unidades del mismo plato deja la otra vigente, porque cada unidad es su propia fila de `ItemComanda`.
- [ ] Anular una unidad de una orden **no terminada** no genera ningún movimiento de inventario.
- [ ] Anular una unidad de una orden **ya terminada** no revierte los movimientos y registra una pérdida por anulación con su costo FIFO.

**Atribución de la anulación (SEC-07)**

- [ ] **Anular sin motivo falla**, igual que registrar una merma sin motivo. El `PRD.md` ya lo pedía —*"anulación de pedido con motivo registrado"*— y hasta acá no era criterio.
- [ ] Toda `PerdidaPorAnulacion` registra **`mesero` y `anulada_en`**. Sin autor, la atribución no cubre la única operación que puede hacer desaparecer dinero ya cobrado.
- [ ] El ranking de **anulaciones y faltantes** del dashboard corta **por mesero además de por plato**. Con el corte solo por plato, una anulación por servicio se pierde entre las legítimas.
- [ ] En un escenario simulado con **dos meseros y varias anulaciones** antes y después de preparar, el reporte dice cuántas anuló cada uno y con qué costo acumulado.
- [ ] Anular es **siempre** del dueño de la cuenta: anular sobre la cuenta de otro mesero **falla en el servidor**, por el mismo camino que cobrarla o editarla (ADR-0017).
- [ ] Ninguna unidad anulada suma a la venta ni a la comisión del mesero.
- [ ] La unidad anulada **no se borra**: queda tachada en la cuenta, con forma además de color.
- [ ] El KDS recibe la anulación y la muestra tachada con icono, no solo en color.
- [ ] Una anulación ocurrida durante un corte del KDS aparece ya anulada al reconectar, nunca como pendiente.

### Disponibilidad

- [ ] Al llegar a cero el stock de cualquier insumo de una receta, sus platos quedan no disponibles con motivo `automatico`.
- [ ] El administrador puede marcar y desmarcar disponibilidad con motivo `manual`.
- [ ] Un cambio de disponibilidad se refleja en las 3 estaciones en ≤ 5 segundos.
- [ ] Un combo queda no disponible en cuanto cualquiera de sus componentes lo está.
- [ ] El plato agotado se muestra deshabilitado en la grilla, no oculto.
- [ ] Con la cocina cerrada, un plato con `requiere_cocina` se deshabilita con **motivo propio** —cocina cerrada, no agotado— porque son dos causas distintas y el mesero necesita saber cuál es: una se resuelve reponiendo stock y la otra no se resuelve hoy.

### Cobro

- [ ] El cobro se inicia con **Cobrar mesa** desde la pantalla del pedido, sin cambiar de estación ni de usuario.
- [ ] La cuenta indica boleta o factura y queda registrada como comprobante sin emitir; una `factura` sin RUC y razón social no se puede grabar.

**Datos personales del receptor (SEC-06)**

- [ ] En **boleta**, los tres campos —DNI, nombre y dirección— **no se piden por defecto**: se ofrecen. El `PRD.md` ya decidió que *"una boleta sin datos es válida"*, y la interfaz tiene que reflejar que **no recolectar es el camino normal**, no una excepción.
- [ ] **Un mesero no puede leer los datos del receptor de un comprobante que no cobró él.** Es la misma frontera que ya rige para *cobros realizados del turno*, extendida al único campo del sistema que guarda datos de un tercero.
- [ ] La **factura** sigue exigiendo RUC, razón social y dirección fiscal: son datos de una empresa y su obligatoriedad es fiscal, no una decisión de producto.
- [ ] Ningún reporte del dashboard, ninguna exportación y ningún evento del canal SSE incluye datos del receptor.
- [ ] Cada cobro almacena venta neta e IGV por separado, y la estación los muestra desglosados.
- [ ] Registrar un pago exige método elegido y comprobante grabado; si falta cualquiera de los dos, la confirmación queda bloqueada.
- [ ] Un pago en efectivo con monto recibido menor al total no se puede confirmar; si excede, la diferencia se ofrece como propina o como vuelto, nunca como venta.
- [ ] La división de cuenta funciona por ítem y por monto, y ningún comensal puede exceder el saldo pendiente.
- [ ] Antes de cerrar la venta se muestra un resumen (total, método, propina, vuelto) y se exige confirmación explícita del mesero.
- [ ] La propina de un pago dividido se acumula una sola vez por venta, no una por comensal.
- [ ] La suma de pagos parciales se compara contra el total, con badge `warning` mientras no cierre.
- [ ] Todo monto por encima del total se registra como propina del **mesero dueño de la cuenta**, con su origen, y nunca suma a la venta.
- [ ] La propina no aparece en el margen de contribución ni en la utilidad.
- [ ] Al confirmar el pago la mesa se libera, la venta se cierra y se calcula la comisión sobre el neto.
- [ ] La venta cerrada conserva su costo: modificar una receta o un precio después no cambia ninguno de sus valores.

### Cobros realizados del turno

- [ ] El mesero consulta la lista de mesas que **él** cobró en el turno en curso, no las de otros meseros.
- [ ] Abrir una mesa cobrada muestra su detalle de consumo (ítems, cantidades, total) sin permitir modificarla.

### Cierre de turno

- [ ] El cierre consolida cuatro subtotales del turno del mesero: ventas en efectivo, ventas por POS, propinas en efectivo y propinas por POS.
- [ ] Cada subtotal se expande al detalle por mesa.
- [ ] **Ventas del turno** se muestran sin propinas: el dinero del mesero y la venta del negocio nunca se suman en la misma cifra.
- [ ] `a_entregar = efectivo recolectado − propinas en efectivo`, y en un turno simulado con al menos 5 propinas en efectivo coincide **exactamente** con las ventas en efectivo del mesero.
- [ ] No se calcula ni se pide efectivo contado, ni fondo inicial, ni diferencia de arqueo.
- [ ] **Cerrar turno con cuentas propias en `abierta` o `en_cobro` es imposible**, no una advertencia: la acción queda bloqueada y lista las cuentas que faltan cobrar, con acceso directo a cada una. Una cuenta con cobro parcial cuenta como abierta.
- [ ] El bloqueo mira **solo las cuentas del propio mesero**: las de otro mesero en la misma mesa no lo afectan.
- [ ] El cierre de turno escribe `Turno.cerrado_en` y con eso **cierra las horas efectivas** (ADR-0020), además de consolidar el dinero.
- [ ] El cierre de turno termina la sesión en la estación (ADR-0014).

### Gestión — menú, combos y recetas

- [ ] El precio se ingresa **neto**; el precio de carta con IGV y el margen por unidad se derivan y se muestran antes de guardar.
- [ ] Un plato sin receta, o con algún insumo sin ninguna compra registrada, queda **no costeable**: no se asume costo cero y no entra en "platos más rentables".
- [ ] No se pueden crear dos platos con el mismo nombre, ni guardar un precio neto menor o igual a cero.
- [ ] Dar de baja un plato que integra un combo **se bloquea**, y se listan los combos afectados con la salida concreta (quitarlo del combo o marcarlo no disponible).
- [ ] Dar de baja un plato no altera ninguna venta cerrada: su `ItemVenta` conserva descripción, precio y costo FIFO (ADR-0004).
- [ ] Cambiar el precio de un plato con cuentas abiertas se advierte, y el precio nuevo aplica solo a rondas futuras: los ítems ya tomados conservan su `precio_unitario_snapshot`.
- [ ] Guardar una receta muestra el margen resultante contra el margen guardado, con la diferencia por unidad.
- [ ] Una receta no se guarda con líneas en cantidad cero, ni con el mismo insumo repetido.
- [ ] Guardar una receta no recalcula ninguna venta cerrada, y el aviso lo dice explícitamente.
- [ ] La disponibilidad manual y la automática se distinguen por `motivo_no_disponible`, y el administrador puede revertir solo la manual.
- [ ] `requiere_cocina` se guarda como lo marcó el administrador: **ninguna regla lo deriva** de la categoría ni de la existencia de receta.
- [ ] Un plato nuevo arranca con `requiere_cocina` en verdadero: el default seguro es que necesite cocina, porque equivocarse hacia el otro lado lo deja vendiéndose con la cocina cerrada.

### Gestión — compras y lotes FIFO

- [ ] Registrar una compra crea un lote con su cantidad, precio pagado, marca de crédito fiscal y fecha.
- [ ] Con crédito fiscal el lote se costea **neto**; sin crédito fiscal, al **precio pagado completo**. La diferencia se muestra como monto antes de confirmar, no como texto.
- [ ] Al cambiar la marca de crédito fiscal, el costo unitario del lote y el costo de entrada al inventario se recalculan a la vista.
- [ ] Una compra con fecha anterior a consumos ya realizados **se advierte, y el aviso dice lo contrario de lo que decía antes**: el lote entra **al final de la cola de consumo** y su fecha es informativa (ADR-0030). Ningún consumo ya escrito se altera.
- [ ] **El libro es reconstruible en cualquier momento:** aplicar la regla de consumo sobre los movimientos escritos devuelve exactamente lo que está escrito, incluso después de registrar compras retroactivas. Es lo que hace verificable el criterio de éxito del costeo manual.
- [ ] No se registra una compra con cantidad o precio menor o igual a cero, ni con fecha futura.
- [ ] El orden de consumo FIFO es **por `numero_lote`, y por nada más** — un orden total por sí solo, sin clave compuesta ni desempate (ADR-0030). `Compra.fecha` **no** participa.
- [ ] El saldo de un lote es su cantidad menos las salidas que lo referencian, y nunca puede superar su cantidad.

### Gestión — inventario, mermas e incidencias

- [ ] Un insumo nuevo arranca sin compras y deja no costeable a todo plato que lo use, hasta registrar su primer lote.
- [ ] La unidad base de un insumo no se puede cambiar después de creado.
- [ ] Registrar una merma exige motivo, consume lotes FIFO y muestra el costo que da de baja antes de confirmar.
- [ ] Una merma que excede el stock se registra igual, deja el stock negativo y lo advierte: el libro ya venía desalineado del físico.
- [ ] La merma **registrada** y el `pct_merma` **estimado** son magnitudes distintas y nunca se suman entre sí.
- [ ] La bandeja de incidencias muestra las ventas que se completaron con stock insuficiente, con su faltante y su origen, y es una cola de trabajo con contador visible en la navegación.
- [ ] Regularizar por **ajuste** agrega un movimiento de ajuste sin costo, no una compra: no inventa un costo que nadie pagó.
- [ ] Regularizar no reescribe la venta que originó la incidencia.

### Gestión — estructura de costos

- [ ] Guardar **crea una versión nueva** con fecha de vigencia; no edita la vigente.
- [ ] Toda versión registra **`creada_por` y `creada_en`**, y la pantalla de parámetros los muestra junto a su vigencia (SEC-08). Son dos datos distintos: `vigente_desde` dice desde cuándo rige, `creada_en` dice cuándo se escribió.
- [ ] Lo mismo aplica al **calendario de apertura**: es el divisor de todo el estado de resultados, es irreversible hacia atrás (ADR-0022) y sin autor un error de carga es indistinguible de un cambio deliberado.
- [ ] Un periodo ya reportado da idéntico resultado antes y después de crear una versión nueva.
- [ ] Antes de guardar se muestra el efecto sobre el margen sumado de los platos costeables, con la diferencia.
- [ ] Los porcentajes de comisión, merma e IGV se rechazan si son negativos o mayores que **10 000 puntos básicos** (100%). Se guardan en puntos básicos, no en porcentaje (ADR-0039): el IGV es `1800`. Cargar `18` no se rechaza —es un valor válido— pero significa **0,18%**, y ese es el error que este criterio tiene que atrapar por rango cuando se pueda, y por revisión de la pantalla cuando no.
- [ ] Los sueldos fijos de meseros no se cargan acá: salen de cada `Persona`, y el total mensual los suma.

### Gestión — personal y liquidación de propinas

- [ ] Los roles disponibles son exactamente `mesero`, `cocina` y `administrador`. **No existe `cajero`.**
- [ ] El PIN son exactamente 4 dígitos, y **dos personas no pueden compartir PIN**: un PIN duplicado rompe la atribución de ventas, comisiones y propinas.
- [ ] Al regenerar un PIN se muestra una sola vez y se persiste su hash, nunca el PIN.
- [ ] Una persona no se borra, se **desactiva**: sus ventas, comisiones y propinas la referencian.
- [ ] Desactivar a un mesero con propinas pendientes se advierte con el monto: la deuda no se cancela al desactivarlo.
- [ ] Solo se liquidan las propinas de origen `pos`. Las de origen `efectivo` ya se descontaron del `a_entregar` de su cierre de turno, y liquidarlas otra vez sería pagarlas dos veces.
- [ ] Liquidar marca las propinas como `liquidada`, deja el saldo por POS en cero y registra una `LiquidacionPropina` con su fecha.
- [ ] La liquidación no toca el estado de resultados: las propinas no son ingreso ni gasto.

### Gestión — calendarios, parámetros y completitud

- [ ] El **calendario de horarios** programa personas por fecha y hora, y muestra las horas programadas por persona y por semana. No marca asistencia y no define días operativos.
- [ ] El **calendario de apertura** se carga como patrón semanal más excepciones fechadas, y muestra cuántos días operativos tiene el mes resultante — el divisor a la vista, no escondido en el cálculo.
- [ ] Guardar un calendario de apertura con `vigente_desde` en el pasado **falla**, con el motivo explicado: reescribiría períodos ya reportados (ADR-0022).
- [ ] La pantalla de **parámetros del sistema** edita IGV, % de comisión, % de merma estimada y umbral de comanda demorada, en un solo lugar, mostrando desde cuándo rige cada cambio.
- [ ] El administrador define y **rota el PIN de cocina** desde gestión; la rotación no invalida el servicio en curso.
- [ ] La **revisión de pendientes** lista lo que quedaría incompleto: platos sin receta, insumos sin ninguna compra registrada, y platos sin `requiere_cocina` definido. Es una vista de trabajo, no un bloqueo de navegación.
- [ ] Ningún formulario de gestión guarda un registro incompleto: la validación es en el campo y en el momento, no un resumen al final.

### Redondeo y exactitud monetaria (ADR-0032)

- [ ] La función de redondeo es **una sola en todo el sistema**: al céntimo más cercano, medio hacia arriba. No hay ningún cálculo de dinero con otra.
- [ ] **Reparto (hay un total que respetar):** se trunca cada parte, y el residuo se asigna de a un céntimo en orden determinista hasta agotarlo. La suma de las partes da el total, **diferencia 0**, por construcción.
- [ ] Los tres repartos del sistema son: precio de combo entre sus platos (orden: precio de lista descendente, empate por id — ADR-0029), costo fijo mensual entre días operativos (orden: día operativo ascendente), y costo del lote entre sus consumos (lo absorbe el movimiento que **agota** el lote).
- [ ] **Porcentaje (no hay total que respetar):** se aplica medio-arriba en la fila más fina donde el importe se persiste, y todo nivel superior es una **suma** de esos enteros. **Ningún reporte recalcula un porcentaje sobre un agregado.**
- [ ] El IGV se redondea **por unidad** en `ItemVenta.igv_unitario`; `Venta.total_igv` es su suma. La comisión, **por venta**, en `Comision.monto`. La merma estimada, **por `ItemVenta`**, sobre su `costo_fifo_snapshot`.
- [ ] La **merma estimada no se aplica** sobre las mermas registradas ni sobre las pérdidas por anulación: esas ya son pérdidas medidas, y estimarles merma encima contaría dos veces la misma plata.
- [ ] **No existe ningún costo unitario de insumo persistido.** El costo de un movimiento es `redondear(cantidad × costo_costeado_lote / cantidad_lote)`, y el movimiento que agota el lote toma el saldo monetario restante.
- [ ] **La suma de los costos de los movimientos de un lote agotado es exactamente su `costo_costeado_total`**, diferencia 0, en un lote consumido por al menos 5 movimientos con cantidades distintas.
- [ ] Un insumo cuyo costo por unidad base es **menor a un céntimo** se costea sin pérdida de precisión: 180 g de un lote de 1200 g a S/ 50,00 cuestan **750**, no 720.
- [ ] El caso sin lote disponible (stock negativo) usa la misma proporción sobre el último lote conocido, y como no hay lote que cerrar, no hay residuo que absorber.
- [ ] `Compra.costo_costeado_total` se calcula y persiste **al registrar la compra**. Una vigencia nueva de `pct_igv` **no cambia** el costo de ningún lote ya registrado.

### Dashboard

- [ ] El margen por plato es igual al precio neto menos el costo FIFO registrado, más la merma estimada.
- [ ] Los platos más vendidos incluyen las unidades vendidas dentro de combos.
- [ ] El precio de un combo se reparte entre sus componentes proporcional a sus precios de lista.

**Combos (ADR-0029)**

- [ ] Vender un combo crea **una fila de `ItemVenta` por componente y ninguna fila del combo**. `SUM(ItemVenta)` da el total de la venta **sin excluir nada**.
- [ ] La suma de los repartos es **exactamente** el precio neto del combo: se trunca cada componente y el residuo se asigna de a un céntimo en orden descendente de precio de lista, empate por id de plato. Diferencia 0.
- [ ] `ItemComanda` referencia **siempre un plato, nunca un combo**. Un combo de tres platos genera tres unidades marcables por separado: se puede marcar una lista, anular otra y declarar la tercera *sin insumo*.
- [ ] *Platos más vendidos* se calcula contando filas por plato, **sin leer `ComboItem`**. Las unidades vendidas dentro de combos entran solas.
- [ ] *Platos más rentables* usa el precio repartido y el `costo_fifo_snapshot` **ya congelados en la fila**, sin leer `Combo` ni `ComboItem` vivos.
- [ ] **Editar la composición de un combo no altera ninguna venta cerrada**: un reporte de un período pasado da idéntico resultado antes y después del cambio.
- [ ] El comprobante y la cuenta **reagrupan por `combo_origen`** y muestran "1 Combo Familiar" con su precio, no tres líneas sueltas.
- [ ] Un combo que contiene algún plato con `requiere_cocina` genera unidades que requieren cocina, y la puerta de ADR-0019 las ve **sin ninguna regla adicional**: son filas de plato como cualquier otra.
- [ ] La comisión por mesero es reproducible a mano: `fijo + 5% de su venta neta cobrada`, diferencia 0.
- [ ] Las propinas aparecen aparte de la comisión, con su saldo pendiente de liquidar.
- [ ] El margen de contribución es igual a `ventas netas − insumos − merma − pérdidas por anulación − comisiones`, diferencia 0, **en los tres períodos**.
- [ ] El margen de contribución se muestra como **línea propia**, arriba de la utilidad. La utilidad se rotula **estimada**; el margen no, porque no lleva ninguna imputación adentro.

**Día operativo (ADR-0028)**

- [ ] Una venta del domingo a las 00:30 pertenece al día operativo del **sábado**, y una de las 05:01 al del domingo. La definición está arriba, en *Modelo de datos*.
- [ ] `Turno`, `ServicioCocina`, `CalendarioApertura`, el estado de resultados y la analítica horaria usan **la misma** función `dia_operativo()`. Ninguna consulta de reporte usa la fecha civil cruda.
- [ ] El `patron_semanal` del `CalendarioApertura` se lee sobre días operativos: *"abre los sábados"* es la jornada que arranca el sábado a las 05:00.
- [ ] Un servicio de cocina que abre el sábado a las 11:00 y cierra el domingo a la 01:00 es **un solo `ServicioCocina`**, dentro de **una sola** jornada.
- [ ] Un mesero que cierra turno a las 00:30 y vuelve a loguearse a las 00:45 **abre un turno nuevo**: *"un turno por jornada"* describe la operación normal, no una restricción de unicidad. Lo que sigue prohibido es que dos turnos del mismo mesero **se superpongan**.
- [ ] Los días operativos **particionan el tiempo**: todo instante pertenece a exactamente una jornada, sin huecos ni solapes. De ahí que la suma de los días siga dando el mes exacto.
- [ ] Un mes es un **conjunto de jornadas**, no un rango de fechas: enero termina el 1 de febrero a las 04:59, y una venta del 1 de febrero a las 00:30 cuenta en enero.
- [ ] El eje horario de un día operativo va de **05:00 a 04:59**, no de 00:00 a 23:59: con el eje civil la franja nocturna quedaría partida entre dos días.
- [ ] `vigente_desde` de `ConfiguracionCostos` y `CalendarioApertura` se compara contra el **día operativo en curso**, no contra la fecha civil del servidor.

**Estado de resultados y prorrateo (ADR-0021, ADR-0022)**

- [ ] El costo fijo diario es `ConfiguracionCostos vigente / días operativos del mes`, y los días operativos salen del `CalendarioApertura`, **no** de las ventas ni de los horarios programados.
- [ ] **La suma de los estados de resultados diarios de un mes es exactamente igual al mensual.** Idem la suma de sus semanas. Sin diferencias de redondeo acumuladas.
- [ ] **El costo fijo imputado de un mes completo suma el 100%** del costo fijo vigente para ese mes, ni más ni menos.
- [ ] Un día **no operativo según el calendario** no recibe costo fijo. Un día operativo **sin ventas** sí lo recibe.
- [ ] Una semana a caballo de dos meses toma, para cada día, el costo diario **del mes al que ese día pertenece**.
- [ ] `ConfiguracionCostos.vigente_desde` y `CalendarioApertura.vigente_desde` **rechazan fechas pasadas**: un período ya reportado no puede cambiar y **no existe ninguna acción de cerrar día, semana ni mes**.
- [ ] Un período calculado sin configuración de costos vigente **se señala como incompleto**, y no reporta una utilidad con un cero adentro.

**Analítica operativa (ADR-0023)**

- [ ] El tiempo de cocina de una orden es `Comanda.terminada_en − Comanda.creada_en`, y el % de demoradas usa el mismo `creada_en` contra `umbral_demora_min`.
- [ ] La rotación de mesa es `Cuenta.cerrada_en − Cuenta.abierta_en`, por mesa y por franja horaria.
- [ ] La curva de **ventas por hora** usa `Cuenta.abierta_en` —la hora del consumo— y no `Venta.cerrada_en`, que es la hora del pago.
- [ ] `Cuenta.cerrada_en` y `Venta.cerrada_en` se escriben en la **misma transacción** del cobro y coinciden siempre; hay una prueba que lo verifica.
- [ ] La matriz de ingeniería de menú cruza unidades vendidas contra margen real, y ubica cada plato en uno de los cuatro cuadrantes con umbrales visibles, no ocultos en el código.
- [ ] Ningún reporte del dashboard consulta `EventoOperacion`: ese registro es para tiempo real y reanudación, y sigue siendo purgable sin afectar reportes.
- [ ] Ningún gráfico usa dos escalas verticales.
- [ ] Todo gráfico que use los slots 3, 4 o 5 de la paleta en modo claro lleva etiquetas directas visibles o vista de tabla.

## Riesgos técnicos abiertos

- **ADR-0006 modificó el PRD, y el PRD ya lo refleja** (v1.3): el pago alimenta comisiones y reportes, y el inventario se descuenta al terminar la orden en cocina. Riesgo remanente, y es de personas: cualquiera que haya leído una versión previa del PRD tiene el modelo mental equivocado, y el error es silencioso — se manifiesta como un stock que no baja cuando esperaba que bajara.
- **Reconciliación entre consumo y venta.** Al separarse en el tiempo, un plato preparado y nunca cobrado descuenta stock sin generar venta. Hace falta un reporte que reconcilie ambos lados; hoy solo existe la pérdida por anulación, que cubre el caso explícito pero no el olvido.
- **Parámetros sin valor.** El de inactividad de sesión (ADR-0014) y el umbral de comanda demorada siguen sin definir, con un rango estrecho entre "molesta" y "no protege". Se fijan con uso real, que este proyecto no va a tener. El bloqueo de mesa dejó de ser un problema: desapareció con ADR-0012.
- **La hora de cierre tardío es un dato que el administrador escribe a mano** (ADR-0024). La traza registra quién la puso y contra qué valor propuesto, pero el sistema no puede validar la realidad: una hora que no ocurrió queda mal y parece bien. Es control por auditoría, no por imposibilidad. Y hasta que el administrador cierre esos turnos, el contraste entre horas programadas y efectivas de ese período no cierra.
- **La rotación de mesas pierde precisión con los cambios de mesa** (ADR-0025). Una cuenta que se movió acumula todo su tiempo en la mesa destino, así que esa mesa se ve más lenta y la de origen no registra nada. Se degrada justo en las noches movidas, que son las que uno querría analizar.
- **El calendario de apertura mal cargado desplaza toda la utilidad, en silencio.** Si declara 30 días operativos y el local abre 26, el costo fijo diario queda 13% bajo y cada día se ve más rentable de lo que es (ADR-0021). Los totales del mes siguen cerrando, así que el error no se delata por ningún lado. Es el mismo riesgo de disciplina de carga que el PRD ya declara para recetas y compras.
- **Corrección hacia atrás imposible por diseño.** Con vigencia solo hacia adelante (ADR-0022), un porcentaje o un calendario cargados mal en julio no se pueden arreglar en septiembre. Es coherente con los snapshots inmutables, pero es una limitación real que la interfaz tiene que decir antes de guardar, no después.
- **Métricas de duración futuras exigen migración.** Al medir con marcas de tiempo en la entidad (ADR-0023) y no sobre el registro de eventos, cualquier duración que no se esté guardando hoy no se puede reconstruir hacia atrás. El caso concreto ya identificado: el instante en que el mesero retira un plato listo no se registra en ningún lado.
- **HTTP/2 es requisito de producción**, no una optimización: sobre HTTP/1.1 el límite de conexiones por origen puede agotarse con varias pestañas por estación (ADR-0008). Con ADR-0033 el TLS que HTTP/2 necesita ya está decidido, así que el requisito dejó de tener un pie en el aire.
- **El certificado vencido deja el local sin sistema, y nada lo anticipa** (ADR-0033). No hay revocación selectiva que lo salve: caen las 5 pantallas a la vez. La renovación es una tarea operativa con consecuencia total y sin alarma en el producto — es el mismo tipo de riesgo por disciplina que la carga de compras, pero con falla dura en vez de silenciosa.
- **La clave privada de la CA es ahora el secreto más fuerte del sistema** (ADR-0033), y desplaza a la contraseña del administrador de ese lugar. No vive en la base, no tiene rotación definida y quien la tenga puede emitir un certificado válido para cualquier nombre sin que ninguna pantalla proteste. Queda fuera del modelo de datos y, por lo tanto, fuera de todo lo que el sistema sabe auditar.
- **El `alcance` del evento es disciplina de carga, y se equivoca en silencio** (ADR-0035). El filtrado del stream es tan bueno como el `alcance` que se le ponga a cada tipo de evento nuevo, y errarle hacia el lado amplio no rompe nada visible: el evento llega a quien no debía y nadie lo nota. El default restrictivo lo acota, no lo elimina. Es el mismo riesgo de disciplina que el calendario de apertura, con la diferencia de que acá el síntoma no es un número raro sino la ausencia de síntoma.
- **Crecimiento sin política de archivado.** El registro de eventos (ADR-0009) y el libro de movimientos (ADR-0005) crecen sin límite. El libro además va a requerir un saldo materializado por insumo cuando sumar movimientos deje de ser viable. **El riesgo del registro de eventos bajó con ADR-0035**: sin `payload`, purgarlo no pierde ningún dato —un cliente que reanuda desde un ID purgado resincroniza y refetchea—, así que pasó de riesgo de datos a decisión de rendimiento. El del libro de movimientos sigue igual.
- **Corrección de datos históricos.** El PRD listó como caso borde corregir una compra ya consumida por ventas cerradas. Con snapshots inmutables el ajuste no se propaga y hace falta un mecanismo explícito que todavía no existe.
- **Despliegue acoplado.** Un solo artefacto de cliente significa que no se puede corregir el dashboard sin recargar el KDS y las estaciones (ADR-0001). En pleno servicio, eso es una ventana de riesgo.
- **La emisión electrónica sigue fuera de alcance.** El comprobante está modelado pero no se emite, así que en un uso real cada venta debería transcribirse a un emisor externo. tRPC (ADR-0010) además no deja una API que un facturador de terceros pueda consumir.
