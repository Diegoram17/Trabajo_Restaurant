# 📊 Dashboard de Seguimiento y Progreso

> **Última actualización:** 2026-08-19  
> **Estado General:** 0 / 30 Ítems Completados

---

## Control por Módulos y Features

### Plataforma y Fundaciones (transversal)
* **Feature / HU:** Como equipo, necesito una base ejecutable (backend, SPA, base de datos y migraciones) sobre la que se apoyen los seis módulos del producto.
  - [ ] Ítem #1: Esqueleto de aplicación y esquema base

* **Feature / HU:** Como negocio, necesito que el dinero y el tiempo se calculen igual en todo el sistema — importes enteros, redondeo único y día operativo de 05:00 a 04:59.
  - [ ] Ítem #2: Núcleo de exactitud

* **Feature / HU:** Como administrador, quiero enrolar y revocar cada pantalla del local para que reciba actualizaciones en vivo sin identificar a ninguna persona.
  - [ ] Ítem #3: Acceso por dispositivo y arranque
  - [ ] Ítem #4: Canal de eventos en vivo

* **Feature / HU:** Como mesero y como administrador, quiero entrar con mi propia llave (PIN de 4 dígitos / usuario y contraseña), con bloqueo que afecte solo a la pantalla atacada.
  - [ ] Ítem #5: Identidad de personas y sesión

---

### Salón — Toma de Pedidos (mesero)
* **Feature / HU:** Como mesero, quiero que mi turno registre mis horas efectivas desde que marco ingreso o hago mi primer login, sin depender de vender nada.
  - [ ] Ítem #6: Turno y horas efectivas

* **Feature / HU:** Como mesero, quiero ver la grilla de mesas libres/ocupadas y llevar mi propia cuenta, independiente de la de otros meseros en la misma mesa.
  - [ ] Ítem #12: Cuenta del mesero y grilla de mesas

* **Feature / HU:** Como mesero, quiero armar el pedido desde el menú visual y enviar la comanda a cocina, con la puerta dura de "sin cocina abierta no se envía comida".
  - [ ] Ítem #13: Toma de pedido y envío de comanda

* **Feature / HU:** Como mesero, quiero vender bebidas y otros ítems que no requieren cocina en cualquier momento, con o sin servicio de cocina abierto.
  - [ ] Ítem #14: Ítems sin cocina

* **Feature / HU:** Como mesero, quiero anular por unidad con motivo y que el ítem quede tachado en la cuenta, con su pérdida costeada según el estado de la comanda.
  - [ ] Ítem #17: Anulación por unidad

* **Feature / HU:** Como mesero, quiero mover mi cuenta a otra mesa cuando el cliente se cambia y fusionar dos cuentas propias cuando dos mesas se juntan.
  - [ ] Ítem #18: Mover y fusionar cuentas

---

### Menú, Platos y Combos
* **Feature / HU:** Como administrador, quiero definir insumos, categorías y platos con receta exacta, y marcar a mano cuáles requieren cocina.
  - [ ] Ítem #7: Catálogo

* **Feature / HU:** Como administrador, quiero armar combos con platos existentes y precio propio, sin duplicar recetas y con costo y disponibilidad derivados de sus componentes.
  - [ ] Ítem #8: Combos

* **Feature / HU:** Como mesero, quiero que un plato agotado desaparezca de mi pantalla al instante, se haya agotado por stock cero o lo haya marcado el administrador.
  - [ ] Ítem #10: Disponibilidad y agotado automático

---

### Cocina — KDS y Estación
* **Feature / HU:** Como cocina, quiero abrir y cerrar el servicio del día con el PIN de 6 dígitos compartido, con confirmación explícita al cerrar.
  - [ ] Ítem #11: Ventana de servicio de cocina

* **Feature / HU:** Como cocina, quiero ver la cola FIFO en la pantalla de pared con una fila por unidad, demoradas marcadas y sin pérdida de comandas tras un corte.
  - [ ] Ítem #15: KDS (pantalla de pared)

* **Feature / HU:** Como cocinero, quiero marcar unidad lista (reversible) y terminar la orden (irreversible), y marcar sin insumo cuando no puedo preparar algo.
  - [ ] Ítem #16: Estación de cocina

---

### Cobro, Propinas y Cierre de Turno
* **Feature / HU:** Como mesero, quiero cobrar mi mesa desde mi propia estación, grabando el comprobante antes del pago y registrando efectivo o POS con vuelto.
  - [ ] Ítem #19: Cobro y venta cerrada

* **Feature / HU:** Como mesero, quiero dividir la cuenta por ítem o por monto y registrar la propina con atajos, viendo siempre si los parciales cuadran.
  - [ ] Ítem #20: División de cuenta y propinas

* **Feature / HU:** Como mesero, quiero cerrar mi turno con el resumen de ventas y propinas y saber exactamente cuánto debo entregar en efectivo.
  - [ ] Ítem #21: Cierre de turno

* **Feature / HU:** Como administrador, quiero liquidar las propinas por POS de cada mesero y dejar su saldo en cero.
  - [ ] Ítem #23: Liquidación de propinas

---

### Inventario FIFO
* **Feature / HU:** Como administrador, quiero registrar compras por lote indicando si generan crédito fiscal, y que el consumo salga siempre del lote más antiguo.
  - [ ] Ítem #9: Compras, lotes y FIFO

* **Feature / HU:** Como administrador, quiero registrar mermas con motivo y regularizar los desfases de stock desde una bandeja de incidencias.
  - [ ] Ítem #26: Mermas e incidencias

---

### Gestión Administrativa y Estructura de Costos
* **Feature / HU:** Como administrador, quiero cerrar los turnos que quedaron abiertos, corrigiendo la hora de salida con motivo y dejándolos marcados como no firmados.
  - [ ] Ítem #22: Cierre tardío por el administrador

* **Feature / HU:** Como administrador, quiero administrar personas, roles y horarios programados, incluyendo regeneración de PIN y desactivación.
  - [ ] Ítem #24: Gestión de personal y horarios

* **Feature / HU:** Como administrador, quiero gobernar el calendario de apertura, la estructura de costos versionada y los parámetros del sistema, incluida la rotación del PIN de cocina.
  - [ ] Ítem #25: Calendarios, costos y parámetros

* **Feature / HU:** Como administrador, quiero una lista de pendientes de configuración antes de dar el trabajo por cerrado, para que ningún hueco reaparezca deformado en el dashboard.
  - [ ] Ítem #27: Revisión de pendientes

---

### Dashboard de Gestión (solo administrador)
* **Feature / HU:** Como administrador, quiero el estado de resultados por día, semana y mes, con costos fijos imputados por día operativo y vistas que reconcilian exacto.
  - [ ] Ítem #28: Dashboard: estado de resultados

* **Feature / HU:** Como administrador, quiero analizar el menú y la venta — más vendidos, más rentables, matriz de ingeniería, ticket promedio y comparativo contra el período anterior.
  - [ ] Ítem #29: Dashboard: menú y venta

* **Feature / HU:** Como administrador, quiero medir gente, operación e inventario — comisiones, horas efectivas vs programadas, tiempos de cocina, rotación de mesas y stock.
  - [ ] Ítem #30: Dashboard: gente, operación e inventario

---

## Resumen de Avance por Módulo

| Módulo | Total Ítems | Completados | Estado / Avance |
| :--- | :--- | :--- | :--- |
| Plataforma y Fundaciones | 5 | 0 | 🔴 0% |
| Salón — Toma de Pedidos | 6 | 0 | 🔴 0% |
| Menú, Platos y Combos | 3 | 0 | 🔴 0% |
| Cocina — KDS y Estación | 3 | 0 | 🔴 0% |
| Cobro, Propinas y Cierre de Turno | 4 | 0 | 🔴 0% |
| Inventario FIFO | 2 | 0 | 🔴 0% |
| Gestión Administrativa y Estructura de Costos | 4 | 0 | 🔴 0% |
| Dashboard de Gestión | 3 | 0 | 🔴 0% |
| **TOTAL** | **30** | **0** | **🔴 0%** |
