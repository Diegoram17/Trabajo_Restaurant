---
title: "Restaurant POS — Design System"
---

# Restaurant POS — Design System

## Alcance de este documento

`DESIGN.md` define **cómo se ve y cómo se siente** el producto: color, tipografía, escala, densidad,
espaciado, estados visuales, patrones de interacción y jerarquía.

**No define comportamiento.** Qué acción existe, cuándo está disponible, qué valida y qué consecuencia
tiene son decisiones de `PRD.md`; los criterios que la implementación debe cumplir están en
`TECH-DESIGN.md`. Este documento describe el aspecto de situaciones definidas en otro lado — nunca las
crea. Si una regla de negocio aparece acá, está en el lugar equivocado y hay que moverla.

La prueba práctica: si una línea de este documento se puede responder con "sí, pero eso también podría
verse de otra forma", es diseño. Si se responde con "eso no es una decisión visual, es una regla", no va
acá.

---

## Design Philosophy

Interfaz moderna, limpia y centrada en el producto. La comida es el elemento visual principal donde
hay alguien eligiendo; en el resto del sistema manda la precisión.

La UI se mantiene mínima —espacio en blanco, fotografía fuerte, alto contraste— y la jerarquía visual
sigue a la tarea. El mesero **elige y cobra**, así que la misma superficie cambia de registro: fotografía
protagonista cuando arma el pedido, cifras tabulares y cero fotografía cuando cuenta dinero. La cocina
ejecuta, así que ve tipografía grande sobre fondo oscuro. El administrador analiza, así que ve densidad
de datos.

---

## Superficies

El sistema tiene **tres** superficies —salón, cocina y administración— repartidas en **cinco vistas**.
Cocina y administración tienen dos cada una porque una misma tarea no se lee y se opera a la misma
distancia. Todo lo que sigue se aplica según esta tabla.

| Vista | Usuario | Dispositivo | Distancia | Modo | Densidad | Fotografía |
|---|---|---|---|---|---|---|
| **Estación** (salón) | Mesero | Táctil compartida | 40–50 cm | Claro | Baja al pedir · Media al cobrar | Sí al pedir · No al cobrar |
| **Cocina · KDS** | Cocina | Pantalla fija de pared | 1.5–2.5 m | Oscuro | Baja | No |
| **Cocina · Estación** | Cocina | Táctil en cocina | 40–60 cm | Oscuro | Baja | No |
| **Administración · Gestión** | Administrador | Desktop | ~60 cm | Claro | Alta | No |
| **Administración · Dashboard** | Administrador | Desktop | ~60 cm | Claro / Oscuro | Alta | No |

> **La estación del mesero es la única vista que cambia de registro según la tarea:** de densidad baja con
> fotografía protagonista al pedir, a densidad media con cifras tabulares y sin fotografía al cobrar y al
> cerrar turno. En el resto del sistema, una vista tiene un solo registro. La referencia visual de ese
> cambio es el prototipo validado `prototypes/estacion-mesero.html`.

---

## Colors

### Primary

`#E31C23`

CTA · estados activos · acciones importantes · promociones.

**Regla de reserva:** el primario significa "esto es accionable". Nunca comunica estado, cantidad,
categoría ni severidad. Un plato agotado no es rojo, porque no es un botón. Esta regla es lo que
mantiene el rojo legible como afordancia en una interfaz que el mesero recorre a toda velocidad.

### Neutral

| Rol | Hex |
|---|---|
| Background | `#FFFFFF` |
| Surface | `#F8F8F8` |
| Border | `#E6E6E6` |
| Heading | `#151515` |
| Body | `#444444` |
| Secondary | `#777777` |

### Accent

`#E8B64C` — Gold

Solo para badges premium y promociones. En este producto, marca **combos** en la Estación: son el
mecanismo promocional del menú y el dorado los distingue del plato individual sin gastar el rojo.

El dorado se usa **siempre como relleno con texto `#151515` encima** (9.76:1). Nunca como texto sobre
fondo claro, nunca como borde, nunca en gráficos.

### Estado

El producto tiene estados operativos permanentes —plato agotado, insumo por agotarse, stock negativo,
comanda pendiente o demorada, división de cuenta sin cerrar, propina sin liquidar— y necesitan una escala propia.
Sin ella todos terminarían en primario, y el rojo dejaría de significar "tocá acá".

| Rol | Hex | Significado |
|---|---|---|
| `good` | `#0ca30c` | Stock sano · comanda preparada · cuenta cubierta · propinas liquidadas |
| `warning` | `#fab219` | Insumo por agotarse · comanda demorada · cuenta en cobro sin confirmar |
| `serious` | `#ec835a` | Venta con stock negativo · anulación después de preparado |
| `critical` | `#d03b3b` | Plato agotado · monto recibido insuficiente · insumo no costeable |

**El estado nunca viaja solo en el color.** Siempre icono + etiqueta de texto. Dos razones medidas:

1. Sobre fondo blanco, `warning` (1.83:1) y `serious` (2.64:1) quedan bajo 3:1. El par icono + texto
   es la mitigación.
2. `critical` `#d03b3b` y el primario `#E31C23` son ambos rojos de contraste casi idéntico (4.80 y
   4.71). Nadie los separa por color. Se distinguen por **forma**: el primario siempre es un control
   con área táctil, `critical` siempre es un badge no interactivo con icono y palabra.

### Datos

El dashboard necesita colores que la paleta de marca no puede dar: el primario está reservado y el
resto son neutros. Esta paleta categórica es deliberadamente fría y sin rojos, para que ninguna marca
de dato pueda confundirse con un control.

| Slot | Hue | Claro | Oscuro |
|---|---|---|---|
| 1 | azul | `#2a78d6` | `#3987e5` |
| 2 | naranja | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | amarillo | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | verde | `#008300` | `#008300` |
| 7 | violeta | `#4a3aa7` | `#9085e9` |

Los slots se asignan **en orden fijo, nunca ciclados**. El orden es el mecanismo de seguridad para
daltonismo, no una decisión estética.

Validada contra las superficies reales del producto (`#FFFFFF` y `#151515`):

- **Claro** — banda de luminosidad ✓ · croma ✓ · separación CVD peor par ΔE 9.1 ✓ · piso de visión
  normal 19.6 ✓ · **contraste: aqua 2.82, amarillo 2.17 y magenta 2.69 quedan bajo 3:1**.
- **Oscuro** — todos los checks pasan, contraste incluido.

> En modo claro, cualquier gráfico que use los slots 3, 4 o 5 debe llevar **etiquetas directas
> visibles o vista de tabla**. Es la única compensación válida para un relleno bajo 3:1.

**Secuencial** (magnitud continua, como ventas por hora): un solo hue, azul, claro→oscuro.
**Divergente** (polaridad, como la variación del margen contra el periodo anterior): azul ↔ rojo con
gris neutro al medio. Nunca
un hue en el punto medio, nunca arcoíris.

### Contraste verificado

| Combinación | Ratio | Uso permitido |
|---|---|---|
| Heading `#151515` sobre fondo | 18.26 | Todo |
| Blanco sobre Heading | 18.26 | Todo — base del KDS |
| Body `#444444` sobre fondo | 9.74 | Todo |
| Texto `#151515` sobre Gold | 9.76 | Todo |
| Primary sobre fondo | 4.71 | Texto ≥ 16px bold |
| Blanco sobre Primary | 4.71 | Texto ≥ 16px bold |
| Secondary `#777777` sobre fondo | 4.48 | **Solo texto grande o elementos de UI** |
| Primary sobre Surface | 4.44 | **Solo texto grande** |
| Gold sobre fondo | 1.87 | **Nunca como texto ni borde** |
| Border `#E6E6E6` sobre fondo | 1.25 | **Nunca como único límite de un control** |
| Surface sobre fondo | 1.06 | Requiere sombra o borde para separarse |

**Cuatro consecuencias de diseño:**

1. **`#777777` no lleva texto pequeño.** A 4.48 queda por debajo del 4.5 que exige AA, y sobre Surface
   baja a 4.22. Todo texto secundario de 12–16px usa Body `#444444`; `#777777` queda para placeholders,
   texto de 18px+ y elementos no textuales.
2. **El primario no lleva texto pequeño.** Etiquetas de botón mínimo 16px bold. Nunca rojo de 12–14px,
   y nunca texto rojo sobre Surface (4.44).
3. **`#E6E6E6` no puede ser el único límite de un control.** A 1.25 es invisible para WCAG. Los inputs
   y botones secundarios llevan borde `#444444` o relleno `#F8F8F8` con borde; `#E6E6E6` queda para
   separadores entre bloques y filas de tabla, donde no delimita nada interactivo.
4. **Una card Surface sobre fondo blanco necesita sombra o borde.** A 1.06 el escalón de color solo no
   la separa.

---

## Typography

**Inter** en todo el sistema — headings bold, body regular. Una sola familia para las tres
superficies: evita que el KDS y el dashboard se lean como productos distintos.

### Escala

| Paso | Tamaño | Dónde vive |
|---|---|---|
| Hero | 64–80px | KDS: número de mesa · Estación en cobro: total a cobrar y *a entregar* del cierre |
| Section | 36–42px | KDS: ítems de la comanda · Estación en cobro: subtotales · Dashboard: cifra hero de KPI |
| Card | 22–28px | Estación: nombre del plato · KDS: mesero y hora |
| Body | 16px | Base en las tres superficies |
| Label | 14px | Etiquetas de campo, badges, leyendas de gráfico |
| Small | 12px | Solo dashboard — ticks de eje y notas al pie |

El paso Small está prohibido en KDS y Estación: a 12px no se lee ni a dos metros ni con prisa.

### Cifras

Todo importe, cantidad de stock y porcentaje de margen usa `font-variant-numeric: tabular-nums`. En un
POS las columnas de dinero se comparan verticalmente y las cifras proporcionales las desalinean. Las
cifras hero de KPI son la excepción: proporcionales, porque están solas.

---

## Spacing

Múltiplos de 8: `4 · 8 · 16 · 24 · 32 · 48 · 64 · 96`.

El espacio en blanco es generoso donde hay elección, y disciplinado donde hay que ver muchas cosas a
la vez.

| Superficie | Espaciado base | Criterio |
|---|---|---|
| Estación — pedido | 24–32 | La foto respira, el toque no se equivoca |
| Estación — cobro y cierre | 16 | Compacto sin error de toque |
| KDS | 16–24 entre comandas | Máximas comandas legibles sin scroll |
| Dashboard | 16–24 entre bloques, 8 en tablas | La densidad es una función |

---

## Border Radius & Elevation

Botones `10–12px` · Inputs `10–12px` · Cards `12px` · Imágenes `12–16px`

Sombra única y sutil:

```
0 4px 18px rgba(0,0,0,.08)
```

El KDS no lleva sombra: sobre fondo oscuro no se ve y solo cuesta render. Ahí la separación entre
comandas es espacio y borde.

---

## Components

### Buttons

**Primary** — relleno `#E31C23`, texto blanco bold ≥ 16px, radio 10–12px, hover un paso más oscuro.
**Secondary** — fondo blanco, texto `#151515`, borde `#444444`, hover `#F8F8F8`.

### Áreas táctiles

| Contexto | Alto mínimo |
|---|---|
| Cualquier control táctil | 48px |
| Acción primaria en Estación, en cualquiera de sus tres modos | 56px |
| Tecla de PIN y de pad numérico | 64px |
| Botón "Preparada" del KDS | 72px — se toca con el dorso de la mano |

Separación mínima entre controles adyacentes: 8px. En acciones destructivas —anular ítem, registrar un
pago, cerrar turno— 16px y confirmación explícita.

### PIN pad

- Teclas de 64px en grilla 3×4, radio 10–12px, fondo blanco, borde `#444444`.
- PIN enmascarado con puntos, sin opción de revelar: es una pantalla compartida a la vista del salón.
- Error de PIN: badge `critical` con icono y texto.
- **Indicador de sesión permanente:** el nombre del mesero activo va fijo en la barra superior a
  22–28px. Que un mesero opere sobre la sesión de otro contamina comisiones y propinas, así que la
  identidad activa tiene que ser imposible de no ver.
- **Mismo componente en la estación de cocina**, en tema oscuro y sin indicador de sesión: ahí el PIN abre
  una estación, no una identidad, y la pantalla no debe sugerir que hay alguien detrás (ver *2b · Estación
  de cocina*).

### Cards

Fondo blanco, sombra suave, imagen de producto grande, esquinas 12px.

**Card de plato** — foto arriba con radio 12–16px, nombre en Card (22–28px), precio en Body bold. Un
plato agotado no se oculta: se muestra deshabilitado, en escala de grises, con badge `critical`
"AGOTADO". Ocultarlo haría que el mesero lo busque una y otra vez.

**Card de combo** — misma anatomía, más badge dorado "COMBO" sobre la imagen y la lista de platos que
lo componen en Label 14px. El mesero necesita saber qué incluye para responderle al cliente.

El badge dorado va sobre la imagen; los badges de estado van en el área de contenido, siempre con
icono. La posición y el icono son lo que los separa: dorado y `warning` son casi indistinguibles en
contraste.

### Inputs

Fondo blanco, radio 10–12px, placeholder `#777777`, borde `#444444` en reposo.

Foco: anillo de 2px en primario **más** cambio de borde. Nunca solo color, para que el foco sobreviva
en escala de grises y para daltónicos.

### Badges de estado

Anatomía fija: `[icono 16px] [ETIQUETA 14px bold]`. Relleno del color de estado al 12%, texto y borde
al 100%, radio 10px. Nunca un punto de color solo.

### Tablas

- Filas de 44px, cifras tabulares alineadas a la derecha, encabezado sticky.
- Separador `#E6E6E6`.
- Fila con incidencia: fondo del color de estado al 8% **más** badge en la fila.

### Navbar

Blanco, sticky, layout limpio, buscador siempre visible.

En la Estación el buscador sirve para encontrar un plato entre cien, y comparte la barra con el mesero
activo y la mesa seleccionada.

---

## Patrones de interacción

Reglas **visuales** transversales. Qué acción existe, cuándo se habilita y qué valida son decisiones del
`PRD.md` y del `TECH-DESIGN.md`; acá se define únicamente **cómo se ve** cada una de esas situaciones.

### Deshabilitado siempre con motivo

Un control deshabilitado lleva el motivo a la vista, en Label bajo el control o dentro del propio botón.
**Nunca gris y mudo.** Un botón apagado sin explicación obliga a adivinar, y adivinar en una pantalla de
dinero termina en un toque a ciegas.

Lo mismo con los elementos no disponibles de una grilla: se **deshabilitan, no se ocultan**, y muestran su
causa. Dos causas distintas se ven distinto — un plato sin stock y un plato que no se puede pedir porque la
cocina cerró no comparten etiqueta, porque una se resuelve hoy y la otra no.

### Validación en el campo, no en un toast

Error de un campo: borde y anillo de foco en `critical`, más un mensaje bajo el campo que dice **qué
hacer**, no qué pasó. El toast se reserva para confirmar lo que ya ocurrió.

### El verbo real en el botón

La acción primaria de una confirmación nombra lo que va a pasar —"Dar de baja", "Registrar merma",
"Cerrar cocina", "Confirmar y liquidar S/ 94.00"— **nunca "Aceptar"**. El usuario tiene que poder leer solo
el botón y saber qué firma.

### Dos pesos para dos consecuencias

Cuando una superficie tiene una acción frecuente y reversible junto a una única e irreversible, **no pueden
parecerse**. La frecuente puede ser la más grande de la pantalla si no tiene consecuencia; la irreversible
va separada, de ancho completo o en otra zona, con los 16px de separación de las destructivas y sin
compartir fila con la otra. Si se parecen, alguien va a tocar la segunda creyendo que es la primera.

La confirmación se reserva para la irreversible. Ponerle una a cada acción frecuente entrena al usuario a
descartarlas sin leer, y ahí se pierde el valor de la que importaba.

### El bloque de consecuencia

Patrón para toda escritura que mueve dinero: un bloque con borde de 2px en `#151515` que descompone el
efecto en líneas y cierra con el resultado en Hero.

- Muestra el **encadenamiento completo**, no el resultado: `precio neto → IGV → costo FIFO → merma →
  margen`. El usuario tiene que poder seguir la aritmética con el dedo.
- Cuando hay un valor anterior, muestra la **diferencia** con flecha y color (`▲ good` / `▼ critical`).
- Cuando el dato no alcanza, dice **qué falta** en lugar de mostrar cero. "Sin receta" no es `S/ 0.00`.

### El bloqueo se explica en una pantalla, no en un error

Cuando una acción no se puede completar por una dependencia, el modal explica **por qué**, **lista lo
afectado** y ofrece la salida concreta. Un `alert` que dice "no se puede" deja al usuario sin nada que
hacer — y si es cara al cliente, sin nada que decirle.

---

## Photography

Fotografía de alta calidad: iluminación cálida, primeros planos, alto contraste, texturas visibles,
fondos oscuros o desenfocados. El producto domina el encuadre.

**Vive en una sola superficie: la Estación del mesero**, donde la foto es el mecanismo de selección.

No hay fotografía en KDS ni en Dashboard, **ni en los modos de cobro y cierre de la Estación**. La cocina
lee texto a distancia y una foto le roba el espacio a los ítems; el cobro maneja números; el dashboard
maneja datos. La misma superficie retira la fotografía cuando cambia de tarea.

---

## Superficies en detalle

> **Alcance de esta sección.** Modo, densidad, escala tipográfica, color, fotografía y jerarquía de cada
> vista — y nada más. Rige *Alcance de este documento*, arriba: acá no se define comportamiento.

### 1 · Estación del mesero

Modo claro, fondo blanco. Una sola superficie con tres modos: **pedir**, **cobrar** y **cerrar turno**.
La barra superior es la constante entre los tres.

- Barra superior fija: mesero activo (22–28px), mesa seleccionada, reloj, y desde la vista de mesas los
  accesos a **Cobros realizados** (secundario) y **Cierre de turno** (primario oscuro).
- Los estados de mesa se distinguen **por etiqueta y color**: cada card lleva su texto —*Libre*,
  *Ocupada*— y su color de estado, nunca el color solo. La mesa con cuenta propia suma un marcado
  distintivo por encima de eso.
- Una mesa puede mostrar **más de una cuenta**. La propia va primero y con el marcado distintivo; las
  ajenas van atenuadas y sin acción, presentes como contexto y no como algo tocable.
- **Sin indicador de cocina en la barra superior.** La barra es del mesero: su identidad, su mesa, su
  reloj. Cuando una acción no procede, el aviso aparece **en el momento del intento**, con el peso del
  *bloque de consecuencia* y no el de un toast que se va solo.
- El aviso de bloqueo muestra siempre las acciones que **sí** quedan disponibles, sin atenuarlas ni
  esconderlas: son las únicas que hay y tienen que verse alcanzables.

**Modo pedir** — fotografía protagonista, densidad baja.

- Grilla de platos por categoría, foto primero, buscador visible.
- **Pedido en curso** como panel lateral persistente: ítems, total acumulado de la mesa y una acción
  primaria única, **Enviar a cocina**.
- El plato no disponible se muestra **deshabilitado con su causa, no oculto**.
- El ítem anulado **queda tachado en la cuenta**, no desaparece: forma además de color, la misma regla que
  usa el KDS.
- **Mover y fusionar son acciones de la cuenta, no de la grilla de platos.** Viven en el panel del pedido
  en curso, como secundarias, lejos de **Enviar a cocina**, que es la única primaria del modo. Son
  frecuentes en un sábado pero no son el trabajo: el trabajo es cargar el pedido.
- **Mover pide elegir la mesa destino sobre el mismo mapa de mesas** que el mesero ya conoce, no sobre una
  lista desplegable de números. La pantalla que se usa para elegir dónde sentar es la que se usa para
  elegir a dónde mover.

**Modo cobrar** — sin fotografía, densidad media, cifras tabulares. La tarea es contar dinero sin
equivocarse.

- Total a cobrar en Hero (64–80px), cifras tabulares.
- **Neto e IGV desglosados y visibles** en Label 14px bajo el total. Mostrarlos es lo que permite
  detectar un error antes de confirmar.
- El comprobante y el método de pago llevan **estado visible** —grabado, elegido— porque son
  prerrequisitos del cobro y el mesero necesita ver de un vistazo qué le falta.
- **Propina como bloque aparte, nunca sumada al total de venta**, con etiqueta explícita
  "Propina — {mesero}". La propina es deuda con el mesero, no ingreso, y la interfaz tiene que decir lo
  mismo que el modelo.
- **División de cuenta:** cada comensal es una card con su total. La suma de parciales contra el total de
  la mesa se muestra **siempre**, con badge `warning` mientras no cierre y `good` cuando cuadra.
- El resumen de confirmación reúne total, método, propina y vuelto en un bloque, con el monto a entregar
  en Hero.
- Cierre en pantalla propia: **Pago registrado**, con el vuelto destacado y las salidas visibles.

**Modo cerrar turno** — densidad media, cifras tabulares, sin fotografía.

- Subtotales del turno como filas expandibles al detalle por mesa. Cifras tabulares alineadas a la
  derecha.
- **El dinero del mesero y la venta del negocio nunca comparten cifra**, ni siquiera visualmente: van en
  filas separadas y con etiquetas que lo dicen.
- Liquidación en **bloque de consecuencia**: el descuento en `good` y el monto a entregar como total en
  Hero. Es la cifra que el mesero firma, así que es la más grande de la pantalla.

### 2 · Cocina

Dos vistas en la misma habitación y con el mismo tema oscuro, separadas por una razón física: **lo que se
lee a dos metros no se toca con precisión, y lo que se toca con precisión no se lee a dos metros**. La
pantalla de pared es de lectura; la estación es de operación.

#### 2a · KDS — pantalla de pared

Modo oscuro, y no por estética. Sobre `#151515` el texto blanco rinde 18.26:1, y los colores de estado
que sobre blanco fallan pasan cómodos: `warning` sube de 1.83 a 9.95, `serious` de 2.64 a 6.92. Es la
superficie donde el estado tiene que leerse desde lejos, y el fondo oscuro es lo que lo permite.

- Fondo `#151515`. Órdenes como bloques con borde, sin sombra.
- Número de mesa en Hero (64–80px): el ancla de lectura a dos metros.
- **Una fila por unidad, nunca "2 ×".** Dos unidades del mismo plato son dos filas. Agrupar por cantidad
  ahorra dos centímetros y le quita a cocina la correspondencia uno a uno entre lo que lee y lo que sale
  del fuego. En la cuenta del mesero sí se agrupan, porque ahí nadie las toca de a una.
- Unidades en Section (36–42px). Mesero, pedido y hora en Card (22–28px). **Nada por debajo de 22px.**
- Estado por color **y** forma: pendiente (neutro), lista (`good` + check), demorada (`warning` + icono
  reloj), anulada y sin insumo (`critical` + tachado + icono). El tachado hace que la anulación sobreviva
  a cualquier daltonismo.
- **La mesa que cambió lleva su número anterior tachado al lado**, en Card 22–28px contra el Hero de la
  mesa nueva. La jerarquía dice sola cuál manda, y el tachado sobrevive a cualquier daltonismo — la misma
  regla que usa la anulación. Un cambio de mesa que solo se distinga por color es un plato que sale a la
  mesa equivocada.
- **Sin ningún control.** No lleva botones, ni PIN, ni avatar, ni indicador de usuario: es una superficie
  de lectura pura, y el chrome de una superficie de lectura es cero.
- **Estado de conexión siempre visible.** La garantía de que ninguna comanda se pierde es invisible si la
  cocina no ve si está en línea o en cola.
- **El estado inactivo se muestra, no se deja en negro.** Una cocina sin comandas, una pantalla caída y una
  cocina que no arrancó se ven igual y no son lo mismo: cada estado lleva **su propia etiqueta en Hero**,
  con palabras, para que se lea a dos metros cuál de los tres es. Sin contadores.

#### 2b · Estación de cocina

Táctil, dentro de la cocina, al alcance de la mano. Mismo tema oscuro que la pared —el cocinero alterna
entre las dos y un salto a modo claro en una cocina encandila— pero a **40–60 cm**, así que la escala baja
a la de la Estación del salón: **mínimo 14px**, no 22px.

**PIN sí, identidad no.** El PIN pad aparece en esta estación, pero **sin nada de lo que lo acompaña en la
estación del mesero**: no hay avatar, no hay nombre de sesión, no hay indicador de sesión permanente en la
barra. El diseño no debe simular lo contrario: nada de un chip "Cocina" que se lea como si alguien
estuviera identificado. Es el tema oscuro del PIN pad, escala de alcance de mano, y desaparece apenas
cumple su función.

- **Pantalla inactiva: una sola acción, centrada, sin campos ni contadores.** Una superficie que espera una
  única decisión no necesita más de un control. El PIN pad llega **después** del toque, como segundo paso a
  pantalla completa, no como un formulario en espera.
- **Cerrar el servicio es la excepción de esa regla:** confirmación primero, PIN después. Dos pantallas
  para una acción, y es la única de la estación que las tiene.
- Es la superficie donde se aplica **"dos pesos para dos consecuencias"** (ver *Patrones de interacción*),
  y donde más importa:
  - La acción **frecuente y reversible** es la más grande de la pantalla: **72px**, se toca con el dorso de
    la mano, tocable sin apuntar.
  - Su **deshacer va en la propia fila ya marcada**, no en un menú: check más `↺` de 48px al lado. Un error
    de dedo cuesta un toque, no una búsqueda.
  - La acción **irreversible** va abajo, de ancho completo, con los 16px de las destructivas, y **no
    comparte fila** con ninguna de las frecuentes.
  - La acción **excepcional** de la fila es secundaria y **nunca del tamaño** de la frecuente: tiene que
    verse excepcional sin quedar escondida.
- **Historial** accesible desde la barra superior, con la misma escala de la estación y sin controles: es
  lectura.
- **Cerrar cocina** en la barra superior, **lejos** de la acción irreversible de la fila: una cierra una
  orden y la otra corta la venta de todo el salón, así que no pueden estar a un dedo de distancia. El PIN
  pad vuelve acá, y su fricción es parte del peso de la acción: lo que corta el salón no se cierra con un
  toque suelto.
- **Modo contingencia.** Cuando esta estación pasa a ser la pantalla que todos miran, adopta la **escala
  del KDS** —número de mesa en Hero, unidades en Section— en lugar de la suya de alcance de mano. Cambió la
  distancia de lectura, así que cambia la escala.

### 3 · Administración (`/admin`)

Una superficie con **dos vistas** que comparten rol, tema y chrome: **Gestión** escribe los datos y
**Dashboard** los lee. Comparten densidad alta y ausencia de fotografía, y se distinguen en una cosa:
el dashboard optimiza para *comparar*, la gestión para *no equivocarse al escribir*.

**Chrome común**

- Sidebar fija de 256px sobre `#F8F8F8`, con la navegación **agrupada por responsabilidad**, no
  alfabética ni plana. Los grupos son etiquetas de 11px en mayúsculas, no items clicables.
- Item activo: fondo blanco y borde izquierdo de 3px en primario. Es el único uso del primario en la
  navegación — el resto es texto.
- Identidad del usuario al pie de la sidebar, no en la barra superior: el administrador trabaja solo y
  por sesiones largas, así que su nombre es contexto, no un control.
- Barra superior con título y **una línea de subtítulo que explica la consecuencia de la pantalla**, no
  su contenido. "Precio, disponibilidad y margen por plato" es descripción; "la baja se bloquea si el
  plato sostiene un combo" es la que evita el error.
- **Contador numérico en la navegación solo para bandejas de trabajo** (incidencias de stock), en
  `critical`. Un contador sobre una pantalla que no exige acción es ruido que enseña a ignorar contadores.

#### 3a · Gestión administrativa

La vista de **escritura**. Es el único lugar del sistema donde un error del usuario no se ve hasta que
aparece deformado en el dashboard, tres semanas después. El diseño responde a eso.

- **Densidad alta, sin fotografía.** Tablas de 44px de fila, encabezados de 11px en mayúsculas con
  `letter-spacing`, cifras siempre tabulares y alineadas a la derecha. El texto alineado a la izquierda.
- **Modal para altas y ediciones; edición en línea solo donde el formulario *es* la pantalla** (la
  estructura de costos). Un alta necesita foco: el modal lo da y hace explícito el punto de confirmación.
- **Estado de fila con badge, nunca con color de fondo.** Igual que en el resto del sistema, todo estado
  lleva icono más texto: `● Sano`, `▲ Por agotarse`, `✕ Agotado`, `✕ No costeable`.
- **Switch para la decisión binaria con consecuencia numérica**, no casilla: 46px, con etiqueta que cambia
  con el estado y el efecto recalculado a la vista. Una casilla se lee como una preferencia; un switch con
  su cifra al lado se lee como una decisión.

**Es la vista donde se concentran los patrones** de *Patrones de interacción*, y la única donde el
**bloque de consecuencia** es la pieza principal en lugar de un accesorio: cada pantalla de escritura
termina en uno. Con eso también van la validación en el campo, el verbo real en el botón y el bloqueo
explicado en una pantalla.

**Turnos sin cerrar** — una bandeja de trabajo, con todo lo que eso implica en este sistema.

Es la segunda bandeja después de las incidencias de stock, así que lleva **contador numérico en la
navegación** en `critical`. La regla se mantiene: contador solo donde hay acción pendiente.

- Tabla de 44px de fila: mesero, fecha, hora de apertura y **hora propuesta** por el sistema, en cifras
  tabulares.
- **La hora propuesta llega escrita en el campo, no en un placeholder.** El administrador corrige sobre un
  valor, no sobre un vacío: partir de una hora razonable es lo que hace que corregirla sea un ajuste y no
  una invención.
- El cierre va en **bloque de consecuencia**, porque mueve dinero: `hora de cierre → horas efectivas →
  ventas en efectivo → a entregar`, con el monto final en Hero. Es la misma cifra que el mesero habría
  firmado, así que se muestra con el mismo peso.
- **El motivo es un campo del formulario, no un opcional al pie.** Sin él la fila no se cierra, y la
  validación va en el campo.
- El resultado se marca en toda la vista como **cerrado por el administrador**, con badge y texto — nunca
  solo por color. Un cierre que firmó otro no puede leerse igual que uno firmado por el mesero, ni acá ni
  en el dashboard.

**Calendario de horarios** — la única vista de gestión que **no es una tabla**.

Grilla semanal: siete columnas de día, una fila por persona. Densidad alta, sin fotografía, igual que el
resto de la vista.

- **La celda es la unidad de toque**, no el día ni la persona: un bloque con las horas en Label 14px sobre
  fondo de color, con el radio de card de 12px y sin sombra. Vacía es superficie limpia, no una casilla
  punteada — la grilla ya comunica que ahí puede haber algo.
- **El color agrupa por rol, no por persona.** Tres colores y no uno por individuo: una paleta categórica
  de siete slots repartida entre doce personas es un código que nadie memoriza y que se rompe apenas entra
  la número ocho.
- **Los tres roles usan los slots 1, 2 y 7** —azul, naranja y violeta—. No es una elección estética: la
  celda lleva **texto sobre el color**, y en modo claro los slots 3, 4 y 5 quedan bajo 3:1. Acá no aplica
  la compensación de etiquetas directas, porque la etiqueta *es* lo que está encima del relleno.
- **La columna de la derecha es la que importa: horas de la semana por persona**, en Card 22–28px,
  tabulares y alineadas a la derecha. Es el único número de la vista que no es una hora del día, así que
  no compite con nada y no necesita etiqueta grande.
- **Bloque de consecuencia al pie**, como toda pantalla de escritura: horas programadas por rol y total de
  la semana, con la diferencia contra la semana anterior (`▲ good` / `▼ critical`).
- Semana sin nada programado: el bloque de consecuencia muestra qué falta —"sin horarios programados"— y
  no un `0:00`, que se lee como un dato cargado.

**Calendario de apertura** — la vista más chica del sistema, y la de mayor consecuencia por píxel.

No es un calendario mensual: es un patrón semanal más una lista de excepciones. Dibujar doce meses para
marcar que se cierra los lunes es pedirle al usuario que recorra 365 celdas para expresar una regla de una
línea.

- **Siete switches, uno por día de la semana.** Es el caso exacto del switch de 46px: decisión binaria con
  consecuencia numérica, con el efecto recalculado a la vista. Una casilla se leería como preferencia.
- **El bloque de consecuencia es el corazón de la pantalla**, no un accesorio al pie, y muestra el
  encadenamiento completo: `costo fijo mensual → días operativos del mes → costo fijo por día`. El
  usuario tiene que poder seguir con el dedo por qué apagar un día le sube el costo diario.
- La cifra de **días operativos del mes** va en Hero: es el divisor de todo el estado de resultados, y no
  puede estar escondida dentro de un cálculo.
- **Excepciones en tabla de 44px de fila**, con badge de estado —`● Abierto` / `✕ Cerrado`— y su fecha en
  cifras tabulares. Icono más texto, nunca color de fondo, como toda fila del sistema.
- La **vigencia** vive arriba, como contexto de toda la pantalla y no como un campo más del formulario.
  Una fecha no seleccionable muestra su motivo, igual que cualquier control deshabilitado.

**Parámetros del sistema** — pocos campos, mucha consecuencia.

Es el segundo caso donde **el formulario *es* la pantalla**, así que va con edición en línea y sin modal,
igual que la estructura de costos.

- **Dos grupos separados visualmente, porque no pesan lo mismo.** Arriba, los que mueven dinero —IGV,
  comisión, merma estimada—: cada uno con su vigencia a la vista y todos bajo un mismo bloque de
  consecuencia. Abajo, los operativos —umbral de comanda demorada—, que no arrastran ninguna cifra y por
  eso no llevan bloque.
- El bloque de consecuencia de los primeros muestra el efecto sobre **una venta de ejemplo**, no sobre el
  período: `neto → IGV → comisión → margen`. Es la única forma de que un porcentaje abstracto se vuelva
  legible antes de guardarse.
- **El PIN de cocina va aparte del resto, y nunca se muestra.** Enmascarado con puntos y sin opción de
  revelar, igual que el PIN pad del salón. Lo único visible es cuándo se actualizó por última vez.
- **Rotar el PIN es la acción irreversible de la pantalla**: separada de los campos numéricos, de ancho
  completo, con los 16px de las destructivas y el verbo real en el botón. No comparte fila con nada.
- En la navegación, los tres viven juntos bajo un grupo propio: son la configuración que sostiene al
  dashboard, no altas de datos del día a día.

**Dispositivos** — la pantalla que enrola los equipos del local.

Va junto a parámetros y no junto a personal, y la distinción es la que ordena todo el diseño de esta
vista: **acá no hay personas, hay equipos**. Confundirlas sería sugerir que la credencial identifica a
alguien, y no lo hace.

- Tabla de 44px de fila: nombre del equipo, rol —`Estación` · `KDS` · `Cocina`—, fecha de enrolamiento y
  badge de estado. Icono más texto, como toda fila del sistema: `● Activo` / `✕ Revocado`.
- **El token se muestra una sola vez, en la pantalla de confirmación del alta**, en cifras tabulares y con
  el aviso de que no se vuelve a ver. Después la fila solo dice cuándo se enroló. Misma regla que el PIN
  regenerado.
- **Revocar es la acción irreversible de la pantalla**, con los 16px de las destructivas y el verbo real
  en el botón. El bloque de consecuencia dice exactamente a qué pantalla deja sin actualizaciones en vivo
  y confirma que **no afecta a las demás**.
- **Ningún dispositivo enrolado se muestra como pendiente, no como vacío.** Una lista vacía acá significa
  que ninguna pantalla del local recibe actualizaciones, y eso es un estado que hay que nombrar — igual
  que la semana sin horarios programados no muestra `0:00`.

**El ingreso a `/admin`** — la única superficie del sistema que no usa PIN pad.

- Formulario de usuario y contraseña, centrado, en modo claro. **No es el PIN pad en versión larga**: la
  restricción física que justifica el teclado numérico —de pie, apurado, con la pantalla a la vista del
  salón— no existe acá, y copiar su forma sugeriría una equivalencia de seguridad que no hay.
- Contraseña enmascarada **con opción de revelar**, al revés que el PIN del salón: acá el administrador
  está solo y el error de tipeo cuesta más que el hombro ajeno.
- El error de credencial es **el mismo para usuario inexistente y para contraseña incorrecta**, en badge
  `critical` con icono y texto. Y el bloqueo por intentos dice **cuánto falta**, no solo que está
  bloqueado: un mensaje sin plazo se lee como una falla del sistema.

**Lo que esta vista no hace**

No muestra gráficos ni KPIs de rentabilidad. Los bloques de cifra que sí tiene son **operativos**
—valor del inventario, insumos que requieren atención, movimientos en el libro— y existen para decidir
qué escribir, no para analizar el negocio. Analizar es el dashboard.

#### 3b · Dashboard del administrador

Modo claro y oscuro, ambos con pasos propios: el oscuro no es una inversión automática del claro.
Densidad alta — el usuario vino a leer datos.

---

## Data Visualization

### Qué forma toma cada dato

| Dato | Forma | Color |
|---|---|---|
| Platos más vendidos | Barras horizontales ordenadas | Serie única, slot 1. Sin leyenda — el título la nombra |
| Platos más rentables | Barras horizontales | Serie única, slot 1 |
| Ventas por día | Línea de 2px | Serie única, slot 1 |
| Ventas por hora | Barras verticales | Serie única, slot 1 |
| Ventas por método de pago | Barras apiladas o dona | Slots 1–4 en orden fijo |
| Margen de contribución | Barras apiladas, un eje | Slots 1–4 por componente de costo |
| Stock e insumos por agotarse | **Tabla, no gráfico** | Badges de estado |
| KPIs del día | Stat tiles, cifra hero | Sin color de serie |

**Nunca colorear barras nominales por su valor.** Un plato no es más azul por vender más: el largo de
la barra ya lo dice, y gastar el canal de identidad en re-codificar magnitud es el error más común.

### Reglas

- **Un solo eje. Nunca doble eje.** "Ventas" y "% de margen" con dos escalas en un mismo gráfico es el
  error más frecuente de todo dashboard. Son dos gráficos, o se indexan a una base común.
- **Leyenda siempre con dos o más series**, y con cuatro o menos, además etiquetas directas. Con una
  sola serie no va leyenda.
- **El texto usa tokens de texto, nunca el color de la serie.** Valores y etiquetas en `#151515` o
  `#444444`; el color lo lleva la marca del gráfico, al lado.
- **Marcas finas:** líneas de 2px, marcadores ≥ 8px, extremos de barra redondeados 4px anclados a la
  línea base, separación de 2px del color de superficie entre segmentos apilados y barras adyacentes.
- **Grilla y ejes recesivos:** `#E6E6E6` en claro, nunca más marcados que los datos.
- **Hover por defecto:** crosshair y tooltip en líneas, tooltip por marca en barras. El área sensible
  es mayor que la marca.
- **Vista de tabla siempre disponible.** Es la vía de acceso alternativa y la compensación obligatoria
  para los slots bajo 3:1 en modo claro.
- **Los colores de estado nunca son una serie.** Si una serie *significa* bueno o malo —incidencias,
  descuadres— usa tokens de estado; si es una categoría más, usa categóricos. Nunca ambos en un
  gráfico.

### Filtros

Una sola fila sobre los gráficos. Rango de fechas como presets —hoy, últimos 7 días, últimos 30 días,
mes en curso— más rango personalizado.

Los presets reflejan cómo se calcula el resultado: **contribución diaria, utilidad mensual**. El
selector no ofrece una utilidad de tres días, porque esa cifra no existe en este producto.

---

## Motion

Transiciones rápidas, 200–300 ms. Sin animaciones innecesarias.

Dos excepciones operativas:

- **Comanda nueva en el KDS: sin animación de entrada.** Un bloque que se desliza mientras el cocinero
  lee mueve el texto bajo su mirada.
- **Confirmaciones destructivas sin animación de salida.** Anular un ítem, registrar un pago o cerrar
  turno resuelve al instante: 300 ms en una acción irreversible se leen como duda del sistema.

Respetar `prefers-reduced-motion` en las tres superficies.

---

## Responsive

**Desktop first.** Las superficies son pantallas fijas: estaciones táctiles, KDS de pared y desktop del
administrador.

Responsive hasta tablet, que es el formato real de una estación. El teléfono no es una superficie de
este producto: el pedido se toma en estaciones compartidas, no en dispositivos personales.

---

## Accessibility

- Contraste medido contra las superficies reales del producto, documentado arriba.
- **Nada comunica solo por color.** Todo estado lleva icono y etiqueta; toda serie de gráfico lleva
  leyenda o etiqueta directa; el foco cambia borde y anillo, no solo color.
- Áreas táctiles según la tabla de botones; mínimo absoluto 48px.
- Texto mínimo 14px en las superficies de alcance de la mano —Estación del salón incluidos cobro y cierre, y estación de cocina—, 22px en la pantalla de pared del KDS. El paso de 12px existe solo en el dashboard.
- Foco visible en todo control, incluido el teclado PIN.
- **Canal de textura disponible** para daltonismo severo, impresión y `forced-colors`: relleno de
  líneas a 45° / 135° en gráficos apilados. Nunca decorativo ni activo por defecto.
- **Modo oscuro seleccionado, no invertido.** Los valores oscuros de la paleta de datos son pasos
  propios validados contra `#151515`.

---

## Design Rules

1. **Food first** donde hay elección: el modo pedido de la Estación del mesero. Es la única vista con fotografía.
2. **Task first** donde hay ejecución: las dos vistas de cocina, las dos de administración, y los modos de cobro y cierre de la Estación.
3. **UI mínima**, jerarquía visual fuerte, espacio en blanco generoso.
4. **El primario solo para acciones.** Nunca para estado, cantidad ni categoría.
5. **El dorado solo como relleno**, para combos y promociones, con texto oscuro encima.
6. **El estado siempre con icono y etiqueta**, nunca solo color.
7. **Alto contraste, medido y no estimado.**
8. **Esquinas redondeadas consistentes**, 10–16px según el elemento.
9. **Cifras tabulares** en todo lo que sea dinero, stock o margen.
10. **Legible a la distancia de uso**: 22px mínimo a dos metros, 14px mínimo a medio metro.
