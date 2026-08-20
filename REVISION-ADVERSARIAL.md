---
title: "Revisión adversarial — POS para Restaurantes"
---

# Revisión adversarial — POS para Restaurantes

**Fecha:** 2026-08-18
**Alcance revisado:** `TECH-DESIGN.md` + los **25 ADRs**, cruzados contra `PRD.md` v1.7 y `DESIGN.md`.
**Condiciones:** la sesión **no produjo** el diseño —el `TECH-DESIGN.md` y los ADRs salieron de sesiones
anteriores—, así que no hay sesgo de auto-preferencia. Sí venía de leer una revisión previa del proyecto,
y el riesgo de eso no es defender el diseño sino **repetir hallazgos viejos en vez de buscar los
actuales**. Se compensó de una sola forma: **cada hallazgo de este documento se verificó contra el texto
vigente** de los documentos, citándolo, y ninguno se hereda de la revisión anterior.

> Este documento **reporta**; no modifica el diseño. Qué se corrige y qué se acepta como riesgo conocido
> es decisión humana. Usá las casillas para llevar el avance entre sesiones.

> **Revisión completa, no incremental.** Reemplaza a la revisión anterior, que estaba reconciliada contra
> `PRD.md` v1.2 y nunca había visto los ADRs 0017 a 0025. Esta pasada cubre los 25 ADRs contra el PRD v1.7.

> **La numeración cambió.** Varios ADRs citan hallazgos por número de la revisión anterior. Equivalencias:
>
> | Cita en los ADRs | Hoy |
> |---|---|
> | *hallazgo #6* — autenticación de `/admin` y del canal SSE | **#10**, sigue abierto |
> | *hallazgo #3* — granularidad de `MovimientoInventario.referencia` | resuelto por ADR-0016; ya no figura |
> | *hallazgo #13* — "Preparada" irreversible sin confirmación | resuelto por ADR-0016; ya no figura |
> | *observación #8* — `Turno` sin existir como entidad | resuelta por ADR-0020; ya no figura |
>
> Los ADRs **no se renumeran**: son registro histórico y citan lo que era cierto cuando se escribieron.
> Esta tabla es la que hace resoluble la cita.

---

## Estado de avance

**Críticos** — **5 / 8 resueltos** (#1, #2, #3, #7, #8)
**Advertencias** — **5 / 7 resueltas** (#6, #10, #11, #13, #14)
**Sugerencias** — **1 / 3 resuelta** (#16, por ADR-0037)

> **Los tres resueltos eran propagación, no decisión.** Ninguno requería resolver nada: alguien ya había
> decidido y el documento no se había enterado. Se cerraron el 2026-08-18 junto con el puntero faltante de
> **ADR-0014 → ADR-0020** y la actualización del índice de ADRs del `TECH-DESIGN.md`, que mostraba 0014, 0016
> y 0020 sin ninguna señal de que algo posterior los había tocado.

**Cinco conviene cerrarlos antes de escribir código**, porque son de esquema o de semántica del dato y
ninguno se arregla después sin recalcular la historia: ~~**#1**~~ (ADR-0026), ~~**#2**~~ (ADR-0027),
~~**#3**~~ (ADR-0028), ~~**#7**~~ (ADR-0029) y ~~**#8**~~ (ADR-0030). **Los cinco están cerrados.**

**El modo de falla dominante no es decidir mal: es no propagar lo decidido.** Once de los dieciocho
hallazgos nacen de que un ADR nuevo cambió una premisa y el documento que dependía de ella no se
actualizó. Los ADRs, tomados de a uno, son de buena calidad — contexto real, alternativas consideradas en
serio y consecuencias con costos declarados sin adornos. El problema vive en las costuras.

---

## 🔴 Crítico

### [x] 1. Un plato que no requiere cocina nunca descuenta inventario — y su comanda puede trabar el cierre de cocina

> **RESUELTO 2026-08-18 — [ADR-0026](adrs/0026-consumo-del-item-sin-cocina.md).** El ítem sin cocina consume
> **al enviarse**: la comanda sin cocina **nace `terminada`**, con sus unidades en `listo`, y escribe su
> inventario en la transacción de creación. No se agregó ningún camino de escritura nuevo — sigue rigiendo
> la regla de ADR-0006 (*se escribe al pasar a `terminada`*), solo que esta llega ahí sola. Con eso el
> bloqueo del cierre de cocina desaparece **por construcción**: la comanda nunca está `pendiente`, así que
> el KDS no necesita ningún filtro. El pedido mixto se persiste como **dos comandas**, con una sola acción
> del mesero. Costos declarados en el ADR: la bebida anulada tras enviarse registra pérdida por anulación
> aunque esté sin abrir (se regulariza por ajuste), `Comanda` deja de ser uno a uno con la ronda, y aparece
> una asimetría nueva — el consumo de bebidas **sí tiene autor** y el de cocina no.

**Objetivo:** ADR-0006 / ADR-0016 × ADR-0019

Dos decisiones correctas por separado se cancelan entre sí:

- **ADR-0006, refinado por ADR-0016:** el movimiento de inventario se escribe **solo** cuando cocina marca
  la orden como `terminada`. Es el único punto de escritura del libro.
- **ADR-0019 y el PRD:** los ítems con `requiere_cocina = false` se venden siempre, con la cocina abierta
  o cerrada, y **no pasan por cocina**.

De la intersección sale que **una bebida con receta no genera ningún `MovimientoInventario`, nunca**. Su
stock no baja, su agotado automático no dispara jamás, y su `costo_fifo_snapshot` queda vacío, así que el
dashboard reporta **toda bebida como margen puro**.

En un restaurante de salón las bebidas son una porción grande del margen, y el PRD construye
explícitamente el camino de venderlas solas: *"una mesa que solo toma bebida es una venta legítima"*. Es
un golpe directo a la tesis del producto —el margen deja de ser un dato para una categoría entera del
menú— y falla **hacia arriba**: el negocio se ve más rentable de lo que es, que es la dirección en la que
un error no se denuncia solo.

Hay una segunda punta, y es un bloqueo operativo. Una comanda de solo bebidas se acepta (ADR-0019) y nace
`pendiente`. **Nada en `TECH-DESIGN.md` dice que el KDS filtre por `requiere_cocina`**: el campo aparece
únicamente en la puerta de envío, en la grilla del mesero y en la gestión del plato. Entonces:

- **Si el KDS no la muestra**, nadie puede terminarla, queda `pendiente` para siempre, y como *"no se
  puede cerrar con órdenes pendientes"* es un bloqueo duro (ADR-0016), **la cocina no puede cerrar nunca**.
  La propiedad que ADR-0016 vende como su mejor resultado —*"queda cerrado por imposibilidad"*— se da
  vuelta contra sí misma.
- **Si el KDS sí la muestra**, cocina marca unidad por unidad bebidas que nunca preparó, contra la física
  que justifica el botón de 72px y contra el principio de que cocina prepara platos.

Ninguna de las dos ramas está elegida, y las dos están rotas.

**Dirección de arreglo:** decidir dónde consume inventario un ítem sin cocina. Reabre el *momento del
consumo* de ADR-0006 para esa clase de ítem —el candidato natural es el cobro, o el envío mismo— y obliga
a decidir explícitamente si esas comandas entran al KDS o nacen ya terminadas.

---

### [x] 2. `estado = fusionada` deja la mesa ocupada para siempre y le bloquea la mesa al mesero

> **RESUELTO 2026-08-18 — [ADR-0027](adrs/0027-cuenta-fusionada-y-marca-de-mesa.md).** El hallazgo resultó
> ser **tres cosas**. (1) El predicado pasó a la **lista blanca** `estado IN (abierta, en_cobro)`, en el
> índice único y en la derivación de la mesa: con `<> cerrada`, cada estado nuevo se colaba solo, que es
> justo lo que pasó con `fusionada`. (2) `fusionada_en` estaba **sobrecargado** —ADR-0025 lo definía como
> FK y el `TECH-DESIGN.md` lo listaba entre timestamps—, así que se partió en `fusionada_en` (timestamp) y
> `absorbida_por` (FK). (3) Lo más grave, y que la revisión no había visto: **el KDS nunca se enteraba de
> la fusión**. Toda la maquinaria de re-etiquetado estaba definida solo para *mover*, y como el índice
> único impide dos cuentas abiertas del mismo mesero en la misma mesa, **toda fusión es entre mesas
> distintas** — el hueco aplicaba al 100% de los casos. La marca pasó a `Comanda.mesa_en_creacion`, un
> snapshot que cubre mover y fusionar con una sola regla y que además sobrevive a un segundo cambio de
> mesa, que antes pisaba `mesa_anterior`. La cuenta absorbida **conserva su `mesa`**: es donde ocurrió.

**Objetivo:** ADR-0017 × ADR-0025

ADR-0017 fija dos reglas normativas, y las dos usan el mismo predicado:

```
UNIQUE (mesa, mesero) WHERE estado <> cerrada

Mesa.estado (derivado):
  0 cuentas no cerradas  → libre
  ≥ 1 cuenta no cerrada  → ocupada
```

ADR-0025 agrega después un **cuarto estado**, `fusionada`, para la cuenta absorbida. Y `fusionada` no es
`cerrada`. La cuenta absorbida **conserva su mesa**, así que:

- **La mesa de origen queda `ocupada` para siempre.** Tiene ≥ 1 cuenta "no cerrada" y ninguna acción puede
  sacarla de ahí: la cuenta ya se fusionó, no hay nada que cobrar. Contradice el PRD —*"la mesa vuelve a
  libre solo cuando no le queda ninguna cuenta abierta"*— y el criterio de aceptación *"la mesa de origen
  vuelve a libre sola"*.
- **Ese mesero no puede volver a abrir cuenta en esa mesa.** El índice único sigue ocupado por la cuenta
  fusionada. Un sábado a la noche, fusionar dos mesas inutiliza una mesa para su propio mesero por el
  resto del servicio.

Lo llamativo es que el proyecto **ya sabe que el predicado es incorrecto y lo dice dos veces**: ADR-0025 lo
declara como costo (*"una consulta que solo excluya `cerrada` va a contar cuentas fusionadas y duplicar
totales"*) y `TECH-DESIGN.md` lo repite como **Trampa**. Pero las dos veces lo escribe como una advertencia
dirigida a los reportes. **ADR-0017 nunca se corrigió**, y ahí el predicado no es una advertencia: es la
definición de la lectura más caliente del sistema y de una restricción de integridad de la base.

Una advertencia en prosa no protege un índice único.

**Dirección de arreglo:** el predicado correcto es `estado IN (abierta, en_cobro)` en los dos lugares, y va
escrito en ADR-0017 —enmendado por ADR-0025, como ADR-0016 fue enmendado por 0018 y 0019—, no en una nota
al pie. Vale además decidir si la cuenta absorbida conserva su `mesa` o pasa a la de destino.

---

### [x] 3. No existe ninguna definición de "día", y de ella dependen el turno, el servicio de cocina y todo el estado de resultados

> **RESUELTO 2026-08-19 — [ADR-0028](adrs/0028-dia-operativo.md).** El día operativo arranca a las **05:00
> hora de Lima** y dura 24 horas; los cinco consumidores —turno, servicio de cocina, calendario de
> apertura, estado de resultados y analítica horaria— usan la misma función `dia_operativo()`. Es una
> **constante**, no un parámetro: `ConfiguracionOperativa` existe para lo que no altera importes y el corte
> sí los altera, y versionarlo reintroduciría el hallazgo #4. Perú no tiene horario de verano, así que la
> conversión no tiene el caso que suele romper esta regla. La decisión obligó **dos precisiones**: *"un
> turno por jornada"* (ADR-0020) y *"un servicio por día"* (ADR-0019) describen la operación normal y **no**
> son restricciones de unicidad — el invariante real, que los turnos no se superpongan, ya estaba escrito.
> Costo principal declarado: **ningún `DATE(timestamp)` suelto vuelve a ser válido**, y el que se olvide
> falla en silencio; la mitigación es estructural — la función vive en un solo lugar de la base.

**Objetivo:** ADR-0019 / ADR-0020 / ADR-0021 / ADR-0022 + modelo de datos

Cuatro decisiones se apoyan en la palabra *día* y ninguna la define:

- *"El **primer login del día** abre el turno"* (ADR-0020), con **un turno por mesero por jornada**.
- *"**Un servicio por día**: abre con el negocio y cierra con el negocio"* (PRD, ADR-0019).
- *"**Días operativos**"* como divisor del costo fijo (ADR-0021).
- Estado de resultados **por día**, con el invariante de que la suma de los días da el mes.

Búsqueda de `medianoche`, `jornada operativa`, `corte del día`, `zona horaria` y `UTC` en `PRD.md`,
`TECH-DESIGN.md` y los 25 ADRs: **cero coincidencias.** No hay corte declarado y no hay decisión de zona
horaria. Por defecto, *día* va a ser la fecha civil del servidor — que es una decisión tomada por omisión.

Eso rompe en un restaurante de salón, que es exactamente el negocio del PRD; el propio ADR-0025 habla de
*"las noches más movidas"*. Un servicio que abre el sábado a las 11:00 y cierra el domingo a la 01:00
produce:

- **Ventas después de medianoche que caen en el día siguiente.** Si el `CalendarioApertura` declara el
  domingo como cerrado, esas ventas aterrizan en un día **no operativo**: facturan y no cargan ningún costo
  fijo, mientras el sábado pierde la recaudación de su propio cierre. El invariante del mes sigue cerrando
  —por eso el error es invisible— pero el resultado **diario**, que es la vista que el administrador mira,
  queda deformado en los dos días.
- **Dos turnos para una sola jornada.** Un mesero que cierra turno a las 00:30 y vuelve a loguearse a las
  00:45 dispara "primer login del día" otra vez, contra la regla de ADR-0020 de un turno por jornada.
- **Un segundo `ServicioCocina`** por el mismo motivo, que el modelo va a leer como la *reapertura
  excepcional* de ADR-0019 cuando fue la misma noche sin interrupción.

Y no hay ningún artefacto donde apoyarse para inferirlo: ADR-0022 eliminó a propósito toda ceremonia de
cierre de día.

**Dirección de arreglo:** decidir un corte de jornada explícito —por ejemplo, el día operativo arranca a
las 06:00 hora local— y aplicarlo **uniformemente** a `Turno`, `ServicioCocina`, `CalendarioApertura` y
toda agregación del dashboard; o declarar como restricción del producto que el local no opera pasada la
medianoche, y escribirlo. Lo que no es viable es dejarlo implícito: son cuatro consumidores que hoy podrían
resolverlo distinto.

---

### [ ] 4. Una vigencia a mitad de mes rompe los dos invariantes del estado de resultados — y la guarda contra fechas pasadas no lo impide

**Objetivo:** ADR-0021 × ADR-0022

ADR-0022 promete estabilidad **por construcción** y la apoya en una sola restricción:

```
ConfiguracionCostos.vigente_desde  >= fecha actual
CalendarioApertura.vigente_desde   >= fecha actual
```

Esa restricción prohíbe el pasado. **No prohíbe mitad de mes.** Y ADR-0021 define el costo diario con una
función de mes entero:

```
costo_fijo_diario(mes) = ConfiguracionCostos vigente / dias_operativos(mes)
```

El singular *"la vigente"* deja de tener referente en cuanto un mes contiene dos versiones. Las dos salidas
posibles fallan:

- **Si cada versión rige sobre sus propios días,** el total del mes es `A×(d₁/N) + B×(d₂/N)`, que no es ni
  `A` ni `B`. Se viola el invariante que el PRD enuncia como criterio de éxito verificable: *"el costo fijo
  imputado de un mes completo suma el 100% del costo fijo cargado para ese mes, ni más ni menos"*.
- **Si rige una sola,** la otra versión no se aplica nunca y su fecha de vigencia es decorativa.

Con `CalendarioApertura` es peor, y acá el hallazgo toca el corazón de ADR-0022. El divisor
`dias_operativos(mes)` es una función **del mes completo**. Cambiar el patrón semanal el día 15 cambia el
divisor, que cambia `costo_fijo_diario`, que **cambia el resultado de los días 1 al 14 — ya reportados**.

Es precisamente el movimiento retroactivo que ADR-0022 declara imposible por construcción. La guarda contra
fechas pasadas no lo detiene, porque el cambio no es retroactivo en su **fecha**: es retroactivo en su
**efecto**, a través de un divisor que abarca todo el mes.

**Dirección de arreglo:** acotar `vigente_desde` de ambas entidades al **primer día de un mes**, no apenas
a "no pasado". Es una restricción más fuerte y hace que los dos invariantes vuelvan a cumplirse por
construcción, que es como ADR-0021 los quería. La alternativa —definir el costo del mes como la suma de los
días con su configuración aplicable— exige reescribir el invariante del PRD, y hay que decirlo.

---

### [ ] 5. La ventana de servicio no tiene control de concurrencia, y las dos reglas duras que la sostienen son carreras

**Objetivo:** ADR-0019 / ADR-0016 × ADR-0007

ADR-0007 es el único ADR que decide concurrencia, y su alcance es explícito: `SELECT ... FOR UPDATE` sobre
los **lotes** de un insumo, con orden por ID para evitar interbloqueos. Búsqueda de `FOR UPDATE`,
`transacción`, `serializable` y `aislamiento` en ADR-0016, ADR-0018 y ADR-0019: **nada**. El estado del
servicio de cocina no tiene ninguna decisión de concurrencia, y sobre él se apoyan dos reglas que el diseño
vende como imposibilidades, no como advertencias:

**Carrera A — la comanda del instante del cierre.** La transacción de la comanda lee "hay servicio abierto"
y persiste; en paralelo, la transacción de cierre hace commit. La comanda queda persistida contra un
servicio cerrado. El PRD lo lista como caso borde —*"comanda enviada en el instante exacto en que cocina
cierra: tiene que rechazarse, no quedar colgada"*— y `TECH-DESIGN.md` lo pone como criterio de aceptación.
**Nada en el diseño lo hace cumplir.**

**Carrera B — el cierre con orden pendiente, que es la peor.** La transacción de cierre verifica "no hay
órdenes pendientes" y sigue; en paralelo, una comanda hace commit. **El cierre se completa con una orden
pendiente adentro.** Eso destruye la propiedad que ADR-0016 declara como su mejor resultado —*"el caso
borde del PRD queda cerrado por imposibilidad: el bloqueo duro del cierre no deja que la situación
exista"*— y deja una orden huérfana que nadie va a terminar, así que **su inventario no se escribe nunca** y
la cocina queda cerrada con comida prometida.

La ironía es que el proyecto ya sabe hacer esto bien: ADR-0007 resuelve el problema análogo sobre lotes y
hasta elimina los interbloqueos por construcción. La técnica está decidida; simplemente nunca se aplicó al
recurso que gobierna si el salón puede vender comida.

**Dirección de arreglo:** tomar `SELECT ... FOR UPDATE` sobre la fila del `ServicioCocina` abierto en **las
dos** rutas —insertar comanda y cerrar servicio—, o correr esas dos transacciones en `SERIALIZABLE`. Y
escribirlo en ADR-0019 con el mismo nivel de detalle con que ADR-0007 lo escribió para los lotes, porque
hoy un implementador no tiene de dónde deducirlo.

---

### [x] 6. `TECH-DESIGN.md` tiene criterios de aceptación mutuamente insatisfacibles sobre el PIN de cocina

> **RESUELTO 2026-08-18.** El criterio 329 quedó acotado a *"no pide identificación **para marcar**"*, con el
> ciclo del servicio declarado como excepción; el 330 perdió *"quien llegue primero"* y ahora explica por qué
> la fila no lleva autor. El 360 se mantuvo, que era el vigente. Se corrigió además una tercera copia que la
> revisión no había detectado: la sección *Arquitectura de componentes* describía `/cocina` como **"sin PIN"**.

**Objetivo:** `TECH-DESIGN.md` §Criterios de aceptación × ADR-0018

Tres criterios del mismo documento, sobre la misma acción:

```
línea 329   La estación no pide identificación en ningún momento:
            ni para iniciar el servicio, ni para marcar (ADR-0016).

línea 330   Iniciar el servicio es una sola acción, disponible para
            quien llegue primero, y queda registrada como ServicioCocina
            sin persona asociada.

línea 360   Abrir el servicio exige el PIN de cocina; un PIN inválido
            no abre nada y no revela si existe (ADR-0018).
```

**No se pueden cumplir los tres.** O la estación pide PIN para iniciar el servicio o no lo pide, y acá
están las dos cosas escritas como casillas que un implementador tiene que tildar.

El origen es de propagación: ADR-0018 **enmienda** a ADR-0016 justamente en este punto —el ciclo del
servicio pasó a estar protegido por un PIN compartido— pero los criterios derivados de ADR-0016 quedaron
tal como estaban. `DESIGN.md` ya se actualizó (§2b dice *"PIN sí, identidad no"* y describe el PIN pad en
la estación de cocina), así que `TECH-DESIGN.md` es el único de los tres documentos que quedó atrás.

No es un problema de redacción: los criterios de aceptación son el contrato de implementación y de prueba.
Con esto, dos personas implementando de buena fe producen sistemas distintos, y las dos pueden demostrar
que cumplieron el documento.

**Dirección de arreglo:** reescribir el criterio 329 acotándolo a lo que sigue siendo cierto —la estación
no pide identificación **para marcar**— y quitar de 330 la parte de "quien llegue primero", que ADR-0018
dejó sin efecto. El criterio 360 es el vigente.

---

### [x] 7. `ItemVenta` no puede representar un combo, y dos criterios del PRD son incomputables sin violar ADR-0004

> **RESUELTO 2026-08-19 — [ADR-0029](adrs/0029-el-combo-se-descompone-al-enviarse.md).** El combo se
> descompone **al enviarse** y no vuelve a existir como fila de dominio: `ItemVenta` guarda una fila por
> componente y **ninguna** del combo, así que `SUM(ItemVenta)` cierra sin excluir nada y el doble conteo es
> imposible en vez de improbable — se descartó a propósito la variante padre-más-hijos por ser la misma
> forma del defecto que #2. Los dos criterios del PRD pasan a leerse de la fila congelada y **nadie mira
> `ComboItem` vivo**. Se fijó además la regla del residuo del reparto, que sin ella rompía el invariante.
> **El hallazgo destapó un problema hermano**: `ItemComanda` estaba definido como *"plato o combo"*, lo que
> haría de un combo de tres platos **una sola unidad marcable** y rompería el marcado en dos pasos de
> ADR-0016. Ahora referencia siempre un plato.

**Objetivo:** ADR-0004 + modelo de datos (`ItemVenta`, `ComboItem`)

`TECH-DESIGN.md` define el snapshot de venta como *"descripción, `precio_unitario_neto`, `igv_unitario`,
cantidad y `costo_fifo_snapshot`"*. Vender un combo produce **una** fila: "Combo Familiar", su precio, su
costo. Pero el PRD exige dos cosas que necesitan la descomposición:

- *Platos más vendidos* **incluye las unidades vendidas dentro de combos**.
- *Platos más rentables* **reparte el precio del combo entre sus componentes**, proporcional a sus precios
  de lista.

Para calcular cualquiera de las dos hay que leer `Combo` y `ComboItem` **vivos**. Y `ComboItem` es
editable: el administrador cambia la composición de un combo —una acción que el módulo de gestión ofrece— y
**todos los reportes históricos cambian con él**.

Eso es exactamente lo que ADR-0004 declara imposible por construcción: *"es imposible que un reporte de un
periodo cerrado cambie, porque no hay nada que recalcular"*. La reproducibilidad histórica, que el propio
ADR llama *"el requisito central"*, se pierde justo en el módulo que el PRD nombra como entregable final.

Es una contradicción directa entre el ADR estructural del producto y dos criterios de éxito verificables, y
**cambia el esquema**, así que arreglarla después de tener datos es una migración con recálculo.

**Dirección de arreglo:** el snapshot tiene que incluir la **expansión del combo** —líneas hijas por
componente, con su precio ya repartido y su costo FIFO ya calculado— y no solo la descripción del combo. El
reparto proporcional se congela en el momento de la venta, que es cuando los precios de lista que lo
determinan todavía son los vigentes.

---

### [x] 8. La clave FIFO por fecha vuelve inverificable el criterio de éxito del costeo

> **RESUELTO 2026-08-19 — [ADR-0030](adrs/0030-clave-de-ordenamiento-fifo.md).** La clave de consumo pasa a
> ser **`numero_lote`, y nada más**: los lotes se consumen en el orden en que se registraron, y una compra
> retroactiva entra **al final de la cola**. `Compra.fecha` se sigue capturando como dato del negocio pero
> **no ordena nada** — se verificó que no se usa para ningún otro cálculo, así que el cambio no arrastra
> nada. Con eso el libro es **siempre reconstruible**: aplicar la regla sobre los movimientos escritos
> devuelve lo que está escrito, y el criterio de éxito del PRD queda verificable a mano sobre el estado
> final, **sin reescribirlo**. La clave además se simplifica: un campo, sin desempate. Es la misma línea
> que ADR-0004, ADR-0005 y ADR-0022 — **el pasado no se reescribe**—, y el libro era el último lugar donde
> un hecho nuevo todavía podía cambiar el orden de los viejos. Costo declarado: *FIFO* pasa a significar
> "el primero registrado" y no "el más antiguo", y el aviso de la compra retroactiva tiene que decir lo
> contrario de lo que decía.

**Objetivo:** ADR-0007 / `TECH-DESIGN.md` §Gestión — compras y lotes FIFO + caso borde del PRD

El orden de consumo **sí está definido** hoy: *"por fecha de compra y, a igual fecha, por número de lote —
una clave total, nunca ambigua"*. Y el caso retroactivo tiene tratamiento: *"una compra con fecha anterior
a consumos ya realizados se advierte: el lote pasa a ser el más antiguo con saldo y los próximos consumos
salen de él, pero las ventas cerradas conservan su costo"*.

El problema no es la ambigüedad: es que esa combinación deja el libro en un estado que **la propia regla ya
no reproduce**. Después de insertar una compra retroactiva, recorrer el libro aplicando "el lote más
antiguo primero" da un resultado distinto del que quedó escrito, porque los movimientos ya escritos
consumieron lotes que hoy deberían haber ido después.

Eso choca de frente con un criterio de éxito del PRD, que es una verificación manual explícita:

> *"El costo de insumos de una venta calculado por el sistema coincide **exactamente** con el cálculo FIFO
> manual, en una muestra de 20 ventas que atraviesen al menos 2 lotes con precios distintos."*

Tras una sola compra retroactiva ese chequeo **falla por diseño** sobre las ventas anteriores a la
inserción, y falla sin que nada esté roto — el sistema hizo lo correcto en su momento. El criterio no dice
contra qué estado del libro se hace el cálculo manual, y hoy hay dos respuestas distintas.

Con un agravante ya documentado: el prototipo de gestión **implementa esta misma rama** —ordena por fecha y
después por id—, así que ya existe código que hereda el comportamiento.

**Dirección de arreglo:** dos caminos, y hay que elegir uno explícitamente. **Orden por inserción**, con lo
que la fecha pasa a ser informativa y FIFO deja de significar literalmente "el lote más antiguo"; o
**mantener el orden por fecha** y acotar el criterio de éxito a que la verificación manual se hace sobre el
estado del libro **al momento de cada venta**, no sobre el estado final. La primera es más simple de
sostener; la segunda es más fiel al negocio. Lo que no se puede es dejar las dos vivas.

---

## 🟡 Advertencia

### [x] 9. La regla de redondeo sigue sin definir, y es un bloqueante disfrazado de riesgo

> **RESUELTO 2026-08-19 — [ADR-0032](adrs/0032-regla-de-redondeo.md).** Una función única —al céntimo más
> cercano, **medio hacia arriba**, elegida porque la verificación que el producto ofrece es manual y nadie
> reproduce medio-par con una calculadora— y **dos familias** según el punto de aplicación, que era la
> mitad que el hallazgo señalaba como faltante. Cuando **hay un total que respetar** se trunca y se
> reparte el residuo de a un céntimo en orden determinista: es lo que ADR-0029 ya había inventado para el
> combo, ahora nombrado y extendido a los otros dos repartos del sistema —costo fijo entre días
> operativos, y costo del lote entre sus consumos—. Cuando **no lo hay**, el porcentaje se aplica en la
> fila más fina donde el importe se persiste —IGV por unidad, comisión por venta, merma por `ItemVenta`—
> y todo nivel superior es una **suma**: con eso la reconciliación día/semana/mes deja de depender de
> disciplina, porque el mes **es** la suma de los días en vez de un recálculo que debería coincidir con
> ella.
>
> Al modelarlo apareció un tercer problema que el hallazgo no cubría y era el más caro: **el costo por
> unidad base de un insumo es sub-céntimo**. `MovimientoInventario.costo_unitario_aplicado`, como entero
> en céntimos y bajo la convención de ADR-0011, costeaba a **4** un gramo que vale 4,1666 — un **4% de
> error** en la única cifra que el producto viene a vender, y silencioso, porque el número que quedaba
> escrito era plausible. El campo se elimina: el costo se calcula por proporción del lote y solo se
> persiste el importe final, y el movimiento que **agota** el lote absorbe el saldo restante, de modo que
> la suma de los movimientos de un lote es exactamente su costo. Se agregó además
> `Compra.costo_costeado_total`, persistido al registrar la compra, porque derivarlo lo ataba a un
> `pct_igv` versionado que le habría cambiado el costo a lotes ya consumidos por ventas cerradas.
>
> Costo declarado: dos días operativos idénticos pueden diferir en un céntimo por el reparto del residuo,
> y medio-arriba tiene sesgo sistemático. Los dos están elegidos, no heredados.

**Objetivo:** ADR-0011 + `TECH-DESIGN.md` §Riesgos técnicos abiertos

ADR-0011 elige enteros en unidad mínima, que es correcto, y declara el costo con precisión: *"los
porcentajes producen fracciones al aplicarse sobre enteros. Hay que fijar una regla de redondeo única y
documentada, y aplicarla siempre en el mismo punto del cálculo, o dos caminos distintos darán resultados
distintos por un céntimo"*. `TECH-DESIGN.md` lo repite en sus riesgos abiertos.

Está bien identificado y **sigue sin decidir**. Pero está catalogado como *riesgo*, y no lo es: el PRD pone
**"diferencia 0"** como criterio de éxito en cuatro cálculos distintos —costo FIFO, cierre de turno,
comisión y estado de resultados—. Un céntimo de diferencia no es un riesgo tolerable en ese marco: es un
criterio incumplido.

Falta además la mitad menos visible del problema: **el punto del cálculo donde se aplica**. Un IGV
redondeado por ítem y sumado no da lo mismo que un IGV calculado sobre el total, y las dos formas son
defendibles. Con la división de cuenta por monto, la diferencia se multiplica por comensal.

**Dirección de arreglo:** fijar regla (redondeo al céntimo más cercano, medio hacia arriba) **y punto de
aplicación** (por ítem o por total, y qué se hace con el residuo), documentarlo en ADR-0011 y agregar el
caso a las pruebas de "diferencia 0". Es una decisión de una tarde que después de tener datos cuesta un
recálculo.

---

### [x] 10. La autenticación de `/admin` y del canal SSE sigue sin decidir, y es el último agujero de identidad del sistema

> **RESUELTO 2026-08-19 — [ADR-0031](adrs/0031-politica-de-acceso.md).** El acceso queda en **tres capas**:
> el **dispositivo** dice qué pantalla es y autoriza **leer el stream SSE** —cookie `httpOnly` que
> `EventSource` envía sin headers, que era el nudo—; la **persona** autoriza acciones (PIN de 4 en la
> estación, **usuario y contraseña** en `/admin`, porque el administrador trabaja solo y por sesiones
> largas y no comparte la restricción física que justifica el PIN); y la **llave de servicio** —PIN de
> cocina, ahora de **6 dígitos**— abre y cierra la ventana. Ninguna capa hace el trabajo de otra. El PIN de
> cocina gana límite de intentos **por dispositivo**, que no arrastra a las otras estaciones y **nunca
> bloquea el marcado**. El arranque siembra **un administrador y nada más**, con rotación obligatoria, y la
> *revisión de pendientes* suma *PIN de cocina sin definir* y *ningún dispositivo enrolado*. Con esto la
> decisión clave no es nueva: **ADR-0016 ya había elegido la identidad de dispositivo y nunca le dio
> mecanismo**.

**Objetivo:** ADR-0014 / ADR-0018 + modelo de datos

`TECH-DESIGN.md` lo dice de frente en el modelo: *"la autenticación de `/admin` sigue **sin decidir**"*. Y
ADR-0018 dedica una consecuencia entera a aclarar que **no** lo resuelve: *"no aporta nada por el lado del
canal SSE. La suscripción de las dos vistas de cocina al stream sigue sin autorización decidida"*.

Están bien declarados, pero llevan sin decidirse desde antes de los nueve ADRs más recientes, y el activo
que protegen creció en el camino. Hoy `/admin` gobierna la estructura de costos, el calendario de apertura
—el divisor de todo el estado de resultados—, los parámetros de dinero, la liquidación de propinas y el PIN
de cocina. Es la superficie de mayor consecuencia del sistema y la única sin política de acceso.

El canal SSE tiene su propia forma del problema, que ADR-0008 hereda sin nombrar: `EventSource` no admite
headers, así que la vía habitual de autorizar la suscripción no está disponible, y ninguna de las dos
vistas de cocina tiene sesión con qué hacerlo.

**Dirección de arreglo:** decidir las dos juntas, porque comparten mecanismo. Para `/admin`, credencial
real y no un PIN de 4 dígitos: es el único rol que trabaja sentado y por sesiones largas, así que no tiene
la restricción física que justifica el PIN en el salón. Para SSE, token de un solo uso en query string o
cookie de sesión, que son las dos salidas que `EventSource` deja.

---

### [x] 11. `CredencialCocina` no tiene arranque: con la base vacía el sistema no puede vender comida

> **RESUELTO 2026-08-19 — [ADR-0031](adrs/0031-politica-de-acceso.md).** Se cerró junto con el #10, porque
> estaban acoplados: la cadena de arranque pasa por la autenticación de `/admin`. Ver el detalle en #10.

**Objetivo:** ADR-0018 + hallazgo #10

La cadena de dependencias se cierra sobre sí misma:

1. Enviar comida exige un `ServicioCocina` abierto (ADR-0019).
2. Abrir el servicio exige el PIN de `CredencialCocina` (ADR-0018).
3. Ese PIN lo define y lo rota **el administrador**, desde `/admin`.
4. La autenticación de `/admin` **no está decidida** (hallazgo #10).

Búsqueda de `bootstrap`, `semilla`, `seed`, `primer administrador`, `instalación` y `datos iniciales` en
`PRD.md`, `TECH-DESIGN.md` y los 25 ADRs: **cero coincidencias.** No hay decisión de arranque en ningún
lado.

No es una objeción de despliegue: pega en la evaluación. Los criterios de éxito del PRD se verifican sobre
un set de datos simulado que debe *"recorrer el ciclo completo sin ninguna intervención manual fuera del
sistema"*, y ese recorrido arranca con una base vacía.

Dos huecos menores del mismo ADR, que conviene resolver en el mismo movimiento: **el formato del PIN de
cocina no está definido** —los 4 dígitos son de `Persona`, y `CredencialCocina` es otra entidad— y **no hay
límite de intentos**. Acá el activo protegido es mayor que en el PIN del mesero: quien adivine este corta
la venta de comida de todo el salón.

---

### [ ] 12. La hora de cierre tardío tiene cota superior pero no inferior, y puede dejar ventas fuera de su propio turno

**Objetivo:** ADR-0024

ADR-0024 valida **una sola** dirección: *"`cerrado_en` no puede ser posterior al `abierto_en` del siguiente
turno del mismo mesero"*, y `TECH-DESIGN.md` repite solo esa. Protege contra turnos superpuestos, que es
real. Del otro lado no hay nada.

Un administrador que corrige "se fue a las 18:00" sobre un turno cuya última venta fue a las 22:00 produce
un turno cuyas **ventas ocurren después de su propio cierre**. Y como `Venta` cuelga de `Turno` —vínculo
que `TECH-DESIGN.md` justifica precisamente para que el cierre sea computable— el `CierreTurno` consolida
efectivo cobrado fuera del intervalo que declara. Las horas efectivas quedan cortas y el *a entregar* queda
inconsistente con las ventas del propio mesero.

El ADR ya declara el costo general —*"si el administrador pone una hora que no ocurrió, el dato queda mal y
parece bien"*— y elige control por auditoría. Pero esta rama concreta **sí es validable por construcción**,
a diferencia de la hora real, que ninguna regla puede conocer.

**Dirección de arreglo:** `cerrado_en >= max(abierto_en, última actividad registrada del turno)`. Es la
misma cota que el sistema ya calcula para **proponer** `cerrado_en_propuesto`; hoy la ofrece como
sugerencia y no la usa como piso.

---

### [x] 13. ADR-0016 declara vigente un párrafo que el PRD reemplazó

> **RESUELTO 2026-08-18.** El estado de ADR-0016 pasó a *"enmendado en **tres** puntos"* y suma la enmienda de
> cadencia del servicio. El párrafo de *"varios servicios por día"* quedó tachado en el cuerpo, con la nota de
> anulación y la aclaración de qué sobrevive: `ServicioCocina` sigue siendo una fila por servicio.

**Objetivo:** ADR-0016 × PRD v1.5

El estado de ADR-0016 dice: *"Aceptado, **enmendado en dos puntos**… El resto del ADR sigue vigente"*, y
enumera los dos: la identidad (ADR-0018) y la asimetría de apertura (ADR-0019).

Pero en el cuerpo, dentro de "el resto", sigue esto:

> *"**Hay varios servicios por día.** Se cierra al terminar el almuerzo y se abre de nuevo para la cena."*

El PRD v1.5 dice lo contrario y de forma explícita: *"**Un servicio por día.** La cocina abre una vez, al
abrir el negocio, y cierra una vez, al cerrarlo. **No se cierra entre almuerzo y cena**: el servicio dura
el día."* ADR-0019 lo menciona al pasar, pero ADR-0016 **certifica ese párrafo como vigente**, y es el que
un lector va a creer porque está en su sección de estado.

Son **tres** enmiendas, no dos. La diferencia importa porque el párrafo obsoleto no es decorativo: el turno
de la cena y la reapertura excepcional son operaciones distintas —una planificada, la otra de excepción— y
el modelo las representa igual, con una fila nueva de `ServicioCocina`. Quien lea ADR-0016 va a creer que
un segundo servicio es rutina.

---

### [x] 14. ADR-0020 declara abierto un caso que ADR-0024 ya cerró

> **RESUELTO 2026-08-18.** El estado de ADR-0020 apunta ahora a ADR-0024, y el párrafo del riesgo pasó de
> *"Riesgo abierto que este ADR no cierra"* a *"Riesgo que este ADR dejó abierto y que ADR-0024 cerró"*, con
> el detalle de la salida elegida. Se agregó también el puntero que faltaba en **ADR-0014 → ADR-0020**, un
> cuarto caso del mismo patrón que esta revisión no había reportado por separado.

**Objetivo:** ADR-0020

ADR-0020 termina con un párrafo rotulado *"Riesgo abierto que este ADR no cierra"*: el mesero que se va sin
cerrar turno, con *"tres salidas anotadas y ninguna elegida"* y la conclusión de que *"el dato de horas
efectivas tiene una cola sucia conocida"*.

ADR-0024 eligió una de esas tres salidas, está **Aceptado**, y es justamente la que ADR-0020 anticipaba.
Pero ADR-0020 no lleva ninguna nota de enmienda.

El proyecto tiene convención para esto y la aplica bien en otros lados —ADR-0016 lleva *"enmendado por 0018
y 0019"* en su estado, ADR-0006 lleva su refinamiento fechado en el cuerpo, ADR-0012 lleva su reemplazo—.
Acá no se aplicó. Es de arreglo trivial, pero el costo es el mismo que `TECH-DESIGN.md` ya declara como
riesgo remanente de ADR-0006: **quien lea ADR-0020 se va con el modelo mental equivocado**. Un ADR que
declara abierto lo que ya se cerró envejece peor que uno incompleto, porque se lee como vigente.

---

### [ ] 15. Dos parámetros operativos siguen sin valor, y uno compite con un criterio de éxito

**Objetivo:** ADR-0014 + `ConfiguracionOperativa`

`TECH-DESIGN.md` lo dice: `umbral_demora_min` e `inactividad_sesion_min` *"siguen sin valor definido"*. El
propio ADR-0014 declara que el segundo es *"un parámetro delicado: muy corto expulsa al mesero mientras
arma un pedido largo; muy largo devuelve el problema que la decisión venía a resolver"*.

Falta la consecuencia que ninguno de los dos documentos saca: **el PRD pone como criterio de éxito que
registrar un pedido de 5 ítems tome ≤ 60 segundos desde el login**. Si la sesión expira mientras el mesero
arma el pedido, el criterio no se puede cumplir, y además —según el propio criterio de aceptación—
*"confirmar un pedido con la sesión expirada falla y no crea comanda"*, así que el trabajo se pierde. Los
dos parámetros están acoplados a criterios verificables y se están tratando como configuración.

El documento reconoce que se fijan con uso real, *"que este proyecto no va a tener"*. Es cierto y honesto,
y justamente por eso hace falta un valor por defecto **elegido y argumentado**, no un campo vacío que el
primer implementador va a llenar con lo que le parezca.

---

## 🔵 Sugerencia

### [x] 16. No existe ninguna decisión de despliegue, y dos ADRs dependen de ella

**Objetivo:** ADR-0008 / ADR-0015 — falta un ADR

Ninguno de los 25 ADRs decide dónde ni cómo corre el sistema. Y hay dos que apoyan sus garantías en eso:

- ADR-0008 declara que **HTTP/2 es requisito de producción**, no una optimización, porque el límite de
  conexiones por origen de HTTP/1.1 puede agotarse con varias pestañas por estación.
- ADR-0015 convierte la red local en una **dependencia dura** de la operación: sin conexión, la estación no
  toma pedidos.

Las dos son afirmaciones sobre un entorno que nadie definió. Un ADR corto —servidor en el local o en la
nube, terminación TLS con HTTP/2, y qué pasa cuando se corta internet si el servidor está afuera— cierra el
hueco. Va como sugerencia y no como advertencia porque el proyecto es académico y no tiene despliegue real,
pero es lo primero que va a faltar el día que lo tenga.

---

### [ ] 17. Dos tablas crecen sin límite y ninguna tiene política de archivado

**Objetivo:** ADR-0005 / ADR-0009

Los dos ADRs declaran el costo con honestidad. ADR-0009: *"la tabla crece con cada evento y necesitará una
política de archivado. Sin ella, la reanudación se vuelve progresivamente más lenta"*. ADR-0005: *"el libro
crece sin límite… va a requerir un saldo materializado por insumo"*.

Lo que falta no es la advertencia sino **el criterio de disparo**: a partir de qué volumen, o de qué tiempo
de respuesta, se actúa. Sin eso el costo declarado no es accionable y se descubre en producción.

Hay además una interacción que ninguno de los dos menciona: ADR-0023 apoya la decisión de **no** usar
`EventoOperacion` como fuente de reportes en que *"no tiene política de retención decidida, así que el día
que alguien lo purgue se lleva puestos todos los reportes históricos"*. El argumento es correcto y elige
bien, pero deja a `EventoOperacion` como la única tabla del sistema que **es seguro purgar** y que
igualmente nadie sabe cuándo purgar.

---

### [ ] 18. La foto del plato no tiene decisión de almacenamiento

**Objetivo:** modelo de datos (`Plato`, `Combo`) — falta un ADR

`Plato` y `Combo` tienen `foto`, y `DESIGN.md` la pone como elemento protagonista del modo pedir:
*"fotografía protagonista"*, *"grilla de platos por categoría, foto primero"*. Es un requisito de interfaz
declarado, sobre la superficie de mayor frecuencia del sistema.

Ningún ADR decide dónde viven esas imágenes, en qué formato, con qué tamaño máximo ni cómo se sirven. Es la
clase de decisión que parece trivial hasta que la grilla de 40 platos tarda en cargar sobre el wifi del
local — y ADR-0015 ya declaró que la red local es una dependencia dura y que su calidad está fuera del
control del producto.

Va como sugerencia porque no compromete ningún dato ni ninguna cifra, y porque a esta escala casi cualquier
respuesta razonable funciona. Pero conviene que sea una respuesta elegida.

---

## Lo que se sostuvo bajo presión

No todo cede, y vale registrar qué aguantó el escrutinio sin defecto real en la decisión misma:

- **ADR-0018** es el ADR más honesto del conjunto. Separa con precisión qué invierte de ADR-0016 y qué deja
  intacto —punto por punto, con el argumento original de cada uno— y dedica una consecuencia completa a
  declarar que **no** resuelve la autenticación del canal SSE y que *"no debe leerse como que lo hace"*. Un
  ADR que se ocupa de acotar lo que no logró es raro, y es lo que hace revisable un diseño.
- **ADR-0021** razona el divisor mejor que el PRD que corrige. La objeción de que *"que el local abra es un
  hecho del negocio, no un subproducto de haber cargado los turnos del personal"* es correcta, y descarta
  la alternativa de derivarlo de las ventas con el argumento exacto: el divisor se movería durante el mes
  en curso. El hallazgo #4 no refuta la decisión, señala que la restricción que la sostiene quedó floja.
- **ADR-0019** elige bien en el punto que más importa y por el motivo correcto: rechaza la división
  automática del envío porque *"un envío que funciona a medias es el peor resultado posible… el costo de la
  ambigüedad lo paga alguien que no está mirando la pantalla"*. Su problema (#5) es de concurrencia, no de
  diseño de la regla.
- **ADR-0016** en su núcleo —el marcado en dos pasos— es la mejor decisión de producto del conjunto.
  Separa la acción frecuente y reversible de la escritura irreversible, y con eso logra que el botón más
  grande y más tocado del sistema **no escriba nada**. Resolvió un problema de seguridad operativa con una
  decisión de modelo, no con una confirmación más.
- **ADR-0007**, por eliminar los interbloqueos **por construcción** —orden por ID de insumo— en vez de por
  detección y reintento. Es la clase de detalle que se descubre tarde y caro.
- **ADR-0004** y **ADR-0011** como principios estructurales. Los hallazgos #7 y #9 no los refutan: los
  aplican más a fondo, señalando dónde el snapshot quedó incompleto y dónde la convención entera todavía no
  tiene su regla de redondeo.

---

## Lectura general

El diseño es serio. Los ADRs tienen contexto real, alternativas que alguien consideró de verdad —varias
declaran que la descartada era **estrictamente superior** en algún eje— y consecuencias que listan costos,
no solo beneficios. Es un conjunto por encima del promedio de lo que se escribe con este nombre.

Y sin embargo hay ocho críticos, lo que pide una explicación. **La debilidad no está en las decisiones sino
en la frontera entre ellas.** Once de los dieciocho hallazgos tienen la misma forma: un ADR nuevo cambió
una premisa, y el documento que dependía de esa premisa no se enteró.

| Cambió | No se enteró | Hallazgo |
|---|---|---|
| ADR-0025 agregó el estado `fusionada` | ADR-0017 quedó con `<> cerrada` | **#2** |
| ADR-0019 sacó ítems del paso por cocina | ADR-0006 quedó como único punto de consumo | **#1** |
| ADR-0022 fijó la vigencia | ADR-0021 quedó con un divisor de mes entero | **#4** |
| ADR-0007 decidió concurrencia solo para lotes | ADR-0019 quedó sin la suya | **#5** |
| ADR-0018 enmendó a ADR-0016 | Los criterios de aceptación quedaron con los dos textos | **#6** |
| ADR-0024 cerró el caso del turno abierto | ADR-0020 quedó declarándolo abierto | **#14** |
| El PRD v1.5 cambió la cadencia del servicio | ADR-0016 quedó certificando la vieja | **#13** |

El patrón es tan consistente que sugiere una contramedida más barata que revisar todo de nuevo: **cuando un
ADR enmienda o reemplaza a otro, la enmienda tiene que tocar los tres lugares donde vive esa decisión** — el
ADR enmendado, el modelo de datos y los criterios de aceptación. Hoy toca uno, a veces dos, y el tercero se
descubre en una revisión como esta o, peor, en el código.

Los otros siete hallazgos son de otra clase y comparten una sola raíz: **decisiones que se pospusieron con
buen criterio y que ya pasaron su fecha**. La regla de redondeo (#9), la autenticación de `/admin` (#10),
los dos parámetros sin valor (#15) y el despliegue (#16) están todos declarados, todos bien argumentados
como diferibles en su momento, y todos siguen abiertos después de que el sistema creciera alrededor de
ellos. Ninguno es difícil. El riesgo de un pendiente honesto es que la honestidad de haberlo declarado se
confunda con haberlo resuelto.
