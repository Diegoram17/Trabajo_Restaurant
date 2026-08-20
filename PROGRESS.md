# Seguimiento y progreso: POS para Restaurantes

> Tablero de avances del pipeline multi-agente (ver `CLAUDE.md`, *División de trabajo entre
> agentes*). Dos vistas del mismo estado: el **tablero de pipeline** dice en qué fase SDD está cada
> cambio y quién tiene la pelota; la **vista por módulos** dice cuánto producto hay construido.
>
> **Última actualización:** 2026-08-20 — **Estado general:** 2 / 30 ítems completados
>
> **Reglas:**
>
> 1. Se actualiza **en el mismo commit que cierra cada fase** SDD — no existe cierre de fase sin
>    su fila actualizada.
> 2. **Si diverge de engram, gana engram** y este archivo se regenera desde ahí — el mismo patrón
>    de precedencia que `openspec/`.
> 3. La columna *Agente* dice quién tiene la pelota ahora, según la división de fases del
>    `CLAUDE.md`. Una fila sin agente asignado no está en curso.

Fases: `propose → spec → design → tasks → apply → verify → archive`.

## Tablero de pipeline

| # | Ítem | Cambio SDD | Fase | Agente | Estado | Referencia |
|---|---|---|---|---|---|---|
| 1 | Esqueleto de aplicación y esquema base | `app-skeleton-base-schema` | — | — | cerrado (archivado, en main) | `3ea1d54` |
| 2 | Núcleo de exactitud | `exactness-core` | — | — | cerrado (archivado, en main) | `76729cc` |
| 3 | Arranque, administrador y dispositivo | — | — | — | pendiente | — |
| 4 | Canal de eventos en vivo | — | — | — | pendiente | — |
| 5 | Identidad del mesero y sesión | — | — | — | pendiente | — |
| 6 | Turno y horas efectivas | — | — | — | pendiente | — |
| 7 | Catálogo | — | — | — | pendiente | — |
| 8 | Combos | — | — | — | pendiente | — |
| 9 | Compras, lotes y FIFO | — | — | — | pendiente | — |
| 10 | Disponibilidad y agotado automático | — | — | — | pendiente | — |
| 11 | Ventana de servicio de cocina | — | — | — | pendiente | — |
| 12 | Cuenta del mesero y grilla de mesas | — | — | — | pendiente | — |
| 13 | Toma de pedido y envío de comanda | — | — | — | pendiente | — |
| 14 | Ítems sin cocina | — | — | — | pendiente | — |
| 15 | KDS (pantalla de pared) | — | — | — | pendiente | — |
| 16 | Estación de cocina | — | — | — | pendiente | — |
| 17 | Anulación por unidad | — | — | — | pendiente | — |
| 18 | Mover y fusionar cuentas | — | — | — | pendiente | — |
| 19 | Cobro y venta cerrada | — | — | — | pendiente | — |
| 20 | División de cuenta y propinas | — | — | — | pendiente | — |
| 21 | Cierre de turno | — | — | — | pendiente | — |
| 22 | Cierre tardío por el administrador | — | — | — | pendiente | — |
| 23 | Liquidación de propinas | — | — | — | pendiente | — |
| 24 | Gestión de personal y horarios | — | — | — | pendiente | — |
| 25 | Calendarios, costos y parámetros | — | — | — | pendiente | — |
| 26 | Mermas e incidencias | — | — | — | pendiente | — |
| 27 | Revisión de pendientes | — | — | — | pendiente | — |
| 28 | Dashboard: estado de resultados | — | — | — | pendiente | — |
| 29 | Dashboard: menú y venta | — | — | — | pendiente | — |
| 30 | Dashboard: gente, operación e inventario | — | — | — | pendiente | — |

## Vista por módulos

### Plataforma y Fundaciones (transversal)
* **Feature / HU:** Como equipo, necesito una base ejecutable (backend, SPA, base de datos y
  migraciones) sobre la que se apoyen los seis módulos del producto.
  - [x] Ítem #1: Esqueleto de aplicación y esquema base — fusionado en main (`3ea1d54`),
    verificado (48 pruebas contra PostgreSQL real, 25 sin base)
* **Feature / HU:** Como negocio, necesito que el dinero y el tiempo se calculen igual en todo el
  sistema — importes enteros, redondeo único y día operativo de 05:00 a 04:59.
  - [x] Ítem #2: Núcleo de exactitud — fusionado en main (`76729cc`), re-verificado PASS tras
    remediar 2 CRITICAL (lock de fila real y auditoría de SQL interpolado)
* **Feature / HU:** Como administrador, quiero enrolar y revocar cada pantalla del local para que
  reciba actualizaciones en vivo sin identificar a ninguna persona.
  - [ ] Ítem #3: Arranque, administrador y dispositivo
  - [ ] Ítem #4: Canal de eventos en vivo
* **Feature / HU:** Como mesero y como administrador, quiero entrar con mi propia llave (PIN de 4
  dígitos / usuario y contraseña), con bloqueo que afecte solo a la pantalla atacada.
  - [ ] Ítem #5: Identidad del mesero y sesión

### Salón — Toma de Pedidos (mesero)
* **Feature / HU:** Como mesero, quiero que mi turno registre mis horas efectivas desde que marco
  ingreso o hago mi primer login, sin depender de vender nada.
  - [ ] Ítem #6: Turno y horas efectivas
* **Feature / HU:** Como mesero, quiero ver la grilla de mesas libres/ocupadas y llevar mi propia
  cuenta, independiente de la de otros meseros en la misma mesa.
  - [ ] Ítem #12: Cuenta del mesero y grilla de mesas
* **Feature / HU:** Como mesero, quiero armar el pedido desde el menú visual y enviar la comanda a
  cocina, con la puerta dura de "sin cocina abierta no se envía comida".
  - [ ] Ítem #13: Toma de pedido y envío de comanda
* **Feature / HU:** Como mesero, quiero vender bebidas y otros ítems que no requieren cocina en
  cualquier momento, con o sin servicio de cocina abierto.
  - [ ] Ítem #14: Ítems sin cocina
* **Feature / HU:** Como mesero, quiero anular por unidad con motivo y que el ítem quede tachado
  en la cuenta, con su pérdida costeada según el estado de la comanda.
  - [ ] Ítem #17: Anulación por unidad
* **Feature / HU:** Como mesero, quiero mover mi cuenta a otra mesa cuando el cliente se cambia y
  fusionar dos cuentas propias cuando dos mesas se juntan.
  - [ ] Ítem #18: Mover y fusionar cuentas

### Menú, Platos y Combos
* **Feature / HU:** Como administrador, quiero definir insumos, categorías y platos con receta
  exacta, y marcar a mano cuáles requieren cocina.
  - [ ] Ítem #7: Catálogo
* **Feature / HU:** Como administrador, quiero armar combos con platos existentes y precio propio,
  sin duplicar recetas y con costo y disponibilidad derivados de sus componentes.
  - [ ] Ítem #8: Combos
* **Feature / HU:** Como mesero, quiero que un plato agotado desaparezca de mi pantalla al
  instante, se haya agotado por stock cero o lo haya marcado el administrador.
  - [ ] Ítem #10: Disponibilidad y agotado automático

### Cocina — KDS y Estación
* **Feature / HU:** Como cocina, quiero abrir y cerrar el servicio del día con el PIN de 6 dígitos
  compartido, con confirmación explícita al cerrar.
  - [ ] Ítem #11: Ventana de servicio de cocina
* **Feature / HU:** Como cocina, quiero ver la cola FIFO en la pantalla de pared con una fila por
  unidad, demoradas marcadas y sin pérdida de comandas tras un corte.
  - [ ] Ítem #15: KDS (pantalla de pared)
* **Feature / HU:** Como cocinero, quiero marcar unidad lista (reversible) y terminar la orden
  (irreversible), y marcar sin insumo cuando no puedo preparar algo.
  - [ ] Ítem #16: Estación de cocina

### Cobro, Propinas y Cierre de Turno
* **Feature / HU:** Como mesero, quiero cobrar mi mesa desde mi propia estación, grabando el
  comprobante antes del pago y registrando efectivo o POS con vuelto.
  - [ ] Ítem #19: Cobro y venta cerrada
* **Feature / HU:** Como mesero, quiero dividir la cuenta por ítem o por monto y registrar la
  propina con atajos, viendo siempre si los parciales cuadran.
  - [ ] Ítem #20: División de cuenta y propinas
* **Feature / HU:** Como mesero, quiero cerrar mi turno con el resumen de ventas y propinas y
  saber exactamente cuánto debo entregar en efectivo.
  - [ ] Ítem #21: Cierre de turno
* **Feature / HU:** Como administrador, quiero liquidar las propinas por POS de cada mesero y
  dejar su saldo en cero.
  - [ ] Ítem #23: Liquidación de propinas

### Inventario FIFO
* **Feature / HU:** Como administrador, quiero registrar compras por lote indicando si generan
  crédito fiscal, y que el consumo salga siempre del lote más antiguo.
  - [ ] Ítem #9: Compras, lotes y FIFO
* **Feature / HU:** Como administrador, quiero registrar mermas con motivo y regularizar los
  desfases de stock desde una bandeja de incidencias.
  - [ ] Ítem #26: Mermas e incidencias

### Gestión Administrativa y Estructura de Costos
* **Feature / HU:** Como administrador, quiero cerrar los turnos que quedaron abiertos, corrigiendo
  la hora de salida con motivo y dejándolos marcados como no firmados.
  - [ ] Ítem #22: Cierre tardío por el administrador
* **Feature / HU:** Como administrador, quiero administrar personas, roles y horarios programados,
  incluyendo regeneración de PIN y desactivación.
  - [ ] Ítem #24: Gestión de personal y horarios
* **Feature / HU:** Como administrador, quiero gobernar el calendario de apertura, la estructura de
  costos versionada y los parámetros del sistema, incluida la rotación del PIN de cocina.
  - [ ] Ítem #25: Calendarios, costos y parámetros
* **Feature / HU:** Como administrador, quiero una lista de pendientes de configuración antes de
  dar el trabajo por cerrado, para que ningún hueco reaparezca deformado en el dashboard.
  - [ ] Ítem #27: Revisión de pendientes

### Dashboard de Gestión (solo administrador)
* **Feature / HU:** Como administrador, quiero el estado de resultados por día, semana y mes, con
  costos fijos imputados por día operativo y vistas que reconcilian exacto.
  - [ ] Ítem #28: Dashboard: estado de resultados
* **Feature / HU:** Como administrador, quiero analizar el menú y la venta — más vendidos, más
  rentables, matriz de ingeniería, ticket promedio y comparativo contra el período anterior.
  - [ ] Ítem #29: Dashboard: menú y venta
* **Feature / HU:** Como administrador, quiero medir gente, operación e inventario — comisiones,
  horas efectivas vs programadas, tiempos de cocina, rotación de mesas y stock.
  - [ ] Ítem #30: Dashboard: gente, operación e inventario

## Resumen de avance por módulo

| Módulo | Total ítems | Cerrados | Avance |
|---|---|---|---|
| Plataforma y Fundaciones | 5 | 2 | 40% |
| Salón — Toma de Pedidos | 6 | 0 | 0% |
| Menú, Platos y Combos | 3 | 0 | 0% |
| Cocina — KDS y Estación | 3 | 0 | 0% |
| Cobro, Propinas y Cierre de Turno | 4 | 0 | 0% |
| Inventario FIFO | 2 | 0 | 0% |
| Gestión Administrativa y Estructura de Costos | 4 | 0 | 0% |
| Dashboard de Gestión | 3 | 0 | 0% |
| **TOTAL** | **30** | **2** | **7%** |

---

**Siguiente accionable:** ítem **#3** — sus dependencias (#1, #2) están aplicadas y fusionadas en
`main`. El **#7** es el único otro ítem con dependencias ya satisfechas (solo #1).
