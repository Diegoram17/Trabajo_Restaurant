# Progreso: POS para Restaurantes

> Tablero de avances del pipeline multi-agente (ver `CLAUDE.md`, *División de trabajo entre
> agentes*). Una fila por ítem del `BACKLOG.md`.
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

**Siguiente accionable:** ítem **#3** — sus dependencias (#1, #2) están aplicadas y fusionadas en
`main`. El **#7** es el único otro ítem con dependencias ya satisfechas (solo #1).
