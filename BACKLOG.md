# Backlog: POS para Restaurantes

Derivado de `PRD.md` y `TECH-DESIGN.md` (+ `adrs/`). Cada ítem es una spec independiente, dimensionada
para un ciclo de SDD. El orden es por **dependencia**, no por prioridad: lo que otros ítems requieren va
primero.

| # | Item | Alcance | Depende de | Contexto extra requerido |
|---|---|---|---|---|
| 1 | Esqueleto de aplicación y esquema base | Backend Node+tRPC, SPA React con 4 rutas, PostgreSQL, migraciones, entidades de configuración sembradas | — | — |
| 2 | Núcleo de exactitud | Importes enteros, redondeo único medio-arriba, reparto con residuo, `dia_operativo()`, resolución de vigencias | #1 | — |
| 3 | Acceso por dispositivo y arranque | `Dispositivo`, token en cookie httpOnly, enrolamiento y revocación, semilla del único administrador | #1 | — |
| 4 | Canal de eventos en vivo | `EventoOperacion`, SSE, reanudación por `Last-Event-ID`, indicador de conexión | #3 | — |
| 5 | Identidad de personas y sesión | `Persona`, PIN de 4 dígitos del mesero, usuario/contraseña del admin, bloqueo por dispositivo | #3 | — |
| 6 | Turno y horas efectivas | `Turno`, apertura por marcado o primer login, invariante de no superposición | #5, #2 | — |
| 7 | Catálogo | `Insumo`, `Categoria`, `Plato`, `RecetaInsumo`, `requiere_cocina`, estado no costeable | #1 | — |
| 8 | Combos | `Combo`/`ComboItem`, disponibilidad y `requiere_cocina` derivados, reparto proporcional del precio | #7, #2 | — |
| 9 | Compras, lotes y FIFO | Lote con `costo_costeado_total`, libro append-only, consumo por `numero_lote` con bloqueo de fila, stock negativo | #7, #2 | Reglas de crédito fiscal e IGV de compras |
| 10 | Disponibilidad y agotado automático | Agotado por stock cero y manual, propagación ≤5s a las 3 estaciones, derivación en combos | #9, #8, #4 | — |
| 11 | Ventana de servicio de cocina | `CredencialCocina` de 6 dígitos, `ServicioCocina`, apertura/cierre con PIN + confirmación, reapertura | #3, #5 | — |
| 12 | Cuenta del mesero y grilla de mesas | `Cuenta` con dueño, unicidad `(mesa, mesero)`, estado de mesa derivado por lista blanca | #5, #4 | — |
| 13 | Toma de pedido y envío de comanda | `Comanda`/`ItemComanda` una fila por unidad, precio snapshot, descomposición del combo, puerta simétrica con rechazo atómico | #12, #11, #8 | — |
| 14 | Ítems sin cocina | Comanda nacida `terminada`, escritura FIFO en la misma transacción, envío mixto como dos comandas | #13, #9 | — |
| 15 | KDS (pantalla de pared) | Cola FIFO, una fila por unidad, demorada derivada, reanudación tras corte, contingencia desde estación | #13, #4 | — |
| 16 | Estación de cocina | Unidad lista reversible, terminar orden irreversible que escribe inventario, *sin insumo*, historial, cierre bloqueado con pendientes | #15, #9, #11 | — |
| 17 | Anulación por unidad | Motivo, tachado en cuenta y KDS, `PerdidaPorAnulacion` con costo FIFO según estado | #16, #14 | — |
| 18 | Mover y fusionar cuentas | Movimiento con sus comandas, fusión solo del mismo mesero, `mesa_en_creacion` y re-etiquetado en KDS | #15, #12 | — |
| 19 | Cobro y venta cerrada | Comprobante grabado antes del pago, `Pago` efectivo/POS con vuelto, `ItemVenta` snapshot, `Comision`, liberación de mesa | #13, #14, #2 | Reglas de boleta/factura: series, correlativos y datos del receptor |
| 20 | División de cuenta y propinas | Parciales por ítem o monto, saldo con estado en palabras, propina única por venta con atajos y origen | #19 | — |
| 21 | Cierre de turno | `CierreTurno` con cuatro subtotales, `a_entregar`, bloqueo con cuentas abiertas, cobros del turno | #20, #6 | — |
| 22 | Cierre tardío por el administrador | Bandeja de turnos abiertos, hora propuesta y corregible, motivo obligatorio, marca de no firmado | #21 | — |
| 23 | Liquidación de propinas | Solo origen POS, `LiquidacionPropina`, saldo por mesero | #20 | — |
| 24 | Gestión de personal y horarios | ABM de personas y roles, regeneración de PIN, desactivación, `HorarioProgramado` | #5 | — |
| 25 | Calendarios, costos y parámetros | `CalendarioApertura`, `ConfiguracionCostos` versionada, rechazo de fechas pasadas, rotación del PIN de cocina | #2, #11 | — |
| 26 | Mermas e incidencias | `Merma` con motivo y costo FIFO, bandeja con modo de regularización, ajuste sin costo | #9, #16 | — |
| 27 | Revisión de pendientes | Lista de huecos de gestión antes de dar el trabajo por cerrado | #7, #9, #25, #3 | — |
| 28 | Dashboard: estado de resultados | Margen de contribución y utilidad estimada por día/semana/mes, prorrateo por día operativo, reconciliación exacta | #25, #19, #17, #26 | Convenciones contables del negocio |
| 29 | Dashboard: menú y venta | Más vendidos, más rentables, matriz de ingeniería, concentración, ticket promedio, categoría, comparativo | #28, #8 | — |
| 30 | Dashboard: gente, operación e inventario | Comisiones y ranking, cierre del día por mesero, horas efectivas vs programadas, tiempos de cocina, rotación, stock | #28, #21, #24, #16 | — |

## Decisiones de despiece

Tres cosas que no se leen del orden y conviene tener presentes al abrir cada spec:

- **Entidad y pantalla se separan cuando la entidad se necesita antes.** `Persona` nace en #5 porque la
  necesita el login; su ABM en `/admin` es #24. Igual con las entidades de configuración: nacen sembradas
  en #1, y sus pantallas y reglas de vigencia son #25.
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
