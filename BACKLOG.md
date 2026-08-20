# Backlog: POS para Restaurantes

Derivado de `PRD.md` y `TECH-DESIGN.md` (+ `adrs/`). Cada ítem es una spec independiente, dimensionada
para un ciclo de SDD. El orden es por **dependencia**, no por prioridad: lo que otros ítems requieren va
primero.

| # | Item | Alcance | Depende de | Contexto extra requerido |
|---|---|---|---|---|
| 1 | Esqueleto de aplicación y esquema base | Backend Node+tRPC que además sirve la SPA React con 4 rutas **en un solo origen**, PostgreSQL, migraciones, **esquema de las entidades de configuración sin filas** —las semillas se movieron al #3—, alojado con el TLS terminado por la plataforma y sin puerto en claro (ADR-0037) | — | Cuentas de Render y Neon; elección del runner de tests, que necesita su propio ADR |
| 2 | Núcleo de exactitud | Importes enteros, redondeo único medio-arriba, reparto con residuo, `dia_operativo()`, resolución de vigencias. **Hereda del #1 una obligación**: el #1 crea `vigente_desde` sin restricción temporal —no hay filas ni camino de escritura todavía—, así que el rechazo de fechas pasadas contra el día operativo (ADR-0022, ADR-0028) **se implementa acá**. Sin esto, la columna queda sin su regla y nadie se entera | #1 | — |
| 3 | Arranque, administrador y dispositivo | Semilla del único administrador con rotación obligatoria y política de contraseña, **login de `/admin` sin dispositivo** con contador por cuenta e IP (ADR-0034), sesión de 60 min con `Secure`/`SameSite=Strict` y validación de `Origin` (ADR-0033), `Dispositivo` con token ≥128 bits, `expira_en` de 90 días con renovación, enrolamiento, rotación y revocación (ADR-0036), y las **filas semilla de las entidades de configuración** —movidas desde el #1— cuyo `creada_por` apunta a ese administrador. **Hereda del #1 una segunda obligación**: el #1 crea `creada_por` como entero obligatorio **sin la clave foránea**, porque `Persona` nace acá; la FK se agrega en este ítem. Sin esto, la columna queda apuntando a nada. **Y una tercera**: como en desarrollo no hay TLS (ADR-0041), los atributos `Secure` y `SameSite` de las cookies que nacen acá **se verifican en este ítem**, no en el #1 | #1 | — |
| 4 | Canal de eventos en vivo | `EventoOperacion` **sin `payload`**: señal de invalidación con `alcance` y `referencia` (ADR-0035), **filtrado por `Dispositivo.rol` en el servidor**, SSE, reanudación por `Last-Event-ID` con el mismo filtro, agrupación de ráfagas, indicador de conexión | #3 | — |
| 5 | Identidad del mesero y sesión | `Persona`, PIN de 4 dígitos con **Argon2id y sal por credencial** (ADR-0036), **verificar PIN exige cookie de dispositivo** (ADR-0034), bloqueo por dispositivo con escalera y contador de respaldo por IP, sesión corta de estación. **Verifica acá** los atributos `Secure` y `SameSite` de la cookie de sesión que nace en este ítem, porque en desarrollo no hay TLS que los ejerza (ADR-0041) | #3 | — |
| 6 | Turno y horas efectivas | `Turno`, apertura por marcado o primer login, invariante de no superposición | #5, #2 | — |
| 7 | Catálogo | `Insumo`, `Categoria`, `Plato`, `RecetaInsumo`, `requiere_cocina`, estado no costeable | #1 | — |
| 8 | Combos | `Combo`/`ComboItem`, disponibilidad y `requiere_cocina` derivados, reparto proporcional del precio | #7, #2 | — |
| 9 | Compras, lotes y FIFO | Lote con `costo_costeado_total`, libro append-only, consumo por `numero_lote` con bloqueo de fila, stock negativo | #7, #2 | Reglas de crédito fiscal e IGV de compras |
| 10 | Disponibilidad y agotado automático | Agotado por stock cero y manual, propagación ≤5s a las 3 estaciones, derivación en combos | #9, #8, #4 | — |
| 11 | Ventana de servicio de cocina | `CredencialCocina` de 6 dígitos con **Argon2id** (ADR-0036), `ServicioCocina`, apertura/cierre con PIN + confirmación, reapertura | #3, #5 | — |
| 12 | Cuenta del mesero y grilla de mesas | `Cuenta` con dueño, unicidad `(mesa, mesero)`, estado de mesa derivado por lista blanca | #5, #4 | — |
| 13 | Toma de pedido y envío de comanda | `Comanda`/`ItemComanda` una fila por unidad, precio snapshot, descomposición del combo, puerta simétrica con rechazo atómico | #12, #11, #8 | — |
| 14 | Ítems sin cocina | Comanda nacida `terminada`, escritura FIFO en la misma transacción, envío mixto como dos comandas | #13, #9 | — |
| 15 | KDS (pantalla de pared) | Cola FIFO, una fila por unidad, demorada derivada, reanudación tras corte, contingencia desde estación | #13, #4 | — |
| 16 | Estación de cocina | Unidad lista reversible, terminar orden irreversible que escribe inventario, *sin insumo*, historial, cierre bloqueado con pendientes | #15, #9, #11 | — |
| 17 | Anulación por unidad | **Motivo obligatorio**, tachado en cuenta y KDS, `PerdidaPorAnulacion` con costo FIFO según estado **y atribución al mesero** (SEC-07), anular la cuenta de otro falla en el servidor | #16, #14 | — |
| 18 | Mover y fusionar cuentas | Movimiento con sus comandas, fusión solo del mismo mesero, `mesa_en_creacion` y re-etiquetado en KDS | #15, #12 | — |
| 19 | Cobro y venta cerrada | Comprobante grabado antes del pago, **datos del receptor minimizados y no pedidos por defecto en boleta**, **nadie lee los de un comprobante que no cobró** (SEC-06), `Pago` efectivo/POS con vuelto, `ItemVenta` snapshot, `Comision`, liberación de mesa | #13, #14, #2 | Reglas de boleta/factura: series, correlativos y datos del receptor |
| 20 | División de cuenta y propinas | Parciales por ítem o monto, saldo con estado en palabras, propina única por venta con atajos y origen | #19 | — |
| 21 | Cierre de turno | `CierreTurno` con cuatro subtotales, `a_entregar`, bloqueo con cuentas abiertas, cobros del turno | #20, #6 | — |
| 22 | Cierre tardío por el administrador | Bandeja de turnos abiertos, hora propuesta y corregible, motivo obligatorio, marca de no firmado | #21 | — |
| 23 | Liquidación de propinas | Solo origen POS, `LiquidacionPropina`, saldo por mesero | #20 | — |
| 24 | Gestión de personal y horarios | ABM de personas y roles, regeneración de PIN, desactivación, `HorarioProgramado` | #5 | — |
| 25 | Calendarios, costos y parámetros | `CalendarioApertura`, `ConfiguracionCostos` versionada, **ambas con `creada_por` y `creada_en` visibles** (SEC-08), rechazo de fechas pasadas, rotación del PIN de cocina | #2, #11 | — |
| 26 | Mermas e incidencias | `Merma` con motivo y costo FIFO, bandeja con modo de regularización, ajuste sin costo | #9, #16 | — |
| 27 | Revisión de pendientes | Lista de huecos de gestión antes de dar el trabajo por cerrado | #7, #9, #25, #3 | — |
| 28 | Dashboard: estado de resultados | Margen de contribución y utilidad estimada por día/semana/mes, prorrateo por día operativo, reconciliación exacta | #25, #19, #17, #26 | Convenciones contables del negocio |
| 29 | Dashboard: menú y venta | Más vendidos, más rentables, matriz de ingeniería, concentración, ticket promedio, categoría, comparativo | #28, #8 | — |
| 30 | Dashboard: gente, operación e inventario | Comisiones y ranking, cierre del día por mesero, horas efectivas vs programadas, tiempos de cocina, rotación, stock, **anulaciones y faltantes cortadas por plato y por mesero** (SEC-07) | #28, #21, #24, #16 | — |

## Decisiones de despiece

Tres cosas que no se leen del orden y conviene tener presentes al abrir cada spec:

- **Entidad y pantalla se separan cuando la entidad se necesita antes.** `Persona` nace en #3 con el
  administrador sembrado y se completa en #5 con el mesero; su ABM en `/admin` es #24. Igual con las
  entidades de configuración: nacen sembradas en #1, y sus pantallas y reglas de vigencia son #25.
- **El arranque manda sobre el orden de acceso** (ADR-0034). La credencial del administrador vive en #3 y
  no en #5, porque enrolar el primer dispositivo exige entrar antes a `/admin`, y `/admin` es la única
  superficie que **no** exige dispositivo. Ponerla en #5 —que depende de #3— cerraba la cadena sobre sí
  misma. `Dispositivo.rol` no tiene el valor `admin`, y esa es la razón de fondo.
- **El ciclo de cocina va en tres ítems** —#11 ventana de servicio, #15 lectura, #16 marcado— porque el
  cierre del servicio necesita que existan órdenes pendientes para poder bloquearse. Esa regla vive en
  #16, no en #11.
- **El corte de emergencia que el PRD ya nombra cae limpio sobre este orden.** Sin #21, #22, #23 y #28 el
  producto todavía sostiene su tesis: pedido → KDS → cobro → inventario → margen por plato.

## Cómo usar este backlog

Cada ítem es una spec independiente. Al implementarlo, arrancá un ciclo de Spec-Driven Development
(`sdd-new` o el flujo equivalente de tu harness) usando **ese ítem** como el *change* — no el proyecto
completo. Si la columna "Contexto extra requerido" tiene algo, compartilo como contexto al generar la
spec de ese ítem.

Antes de generar la spec de #9, #19 o #28, compartí tu documentación de reglas de negocio de ese dominio
como contexto, si la tenés: el PRD y el TDD fijan el comportamiento, pero no la letra chica tributaria ni
contable que esos tres ítems tocan.
