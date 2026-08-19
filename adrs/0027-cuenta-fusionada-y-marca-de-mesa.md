# ADR 0027: La cuenta fusionada no ocupa la mesa, y el cambio de mesa se marca en la comanda

## Estado

Aceptado — cierra el hallazgo #2 de `REVISION-ADVERSARIAL.md`. Corrige **ADR-0017** en su predicado y
**ADR-0025** en dos puntos: la definición de `fusionada_en` y la cobertura del KDS.

## Contexto

ADR-0017 fijó dos reglas normativas sobre el mismo predicado, y las escribió cuando `Cuenta` tenía tres
estados:

```
UNIQUE (mesa, mesero) WHERE estado <> cerrada

Mesa.estado (derivado):
  ≥ 1 cuenta no cerrada  → ocupada
```

ADR-0025 agregó después un **cuarto estado**, `fusionada`, para la cuenta absorbida. Y `fusionada` no es
`cerrada`, así que la cuenta absorbida —que conserva su mesa— seguía contando:

- **la mesa de origen quedaba `ocupada` para siempre**, sin ninguna acción capaz de liberarla, porque la
  cuenta ya se fusionó y no hay nada que cobrar;
- **ese mesero no podía volver a abrir cuenta en esa mesa**, porque el índice único seguía tomado.

El proyecto ya sabía que el predicado era incorrecto —ADR-0025 lo declara como costo y `TECH-DESIGN.md`
lo repite como *Trampa*— pero las dos veces como una advertencia dirigida a los reportes. Una advertencia
en prosa no protege un índice único.

Al corregirlo aparecieron dos cosas más, y la segunda es más grave que el predicado.

**`fusionada_en` estaba sobrecargado.** ADR-0025 lo define como *"referencia a la cuenta que la
absorbió"*, es decir una clave foránea. Pero `TECH-DESIGN.md` lo lista junto a `abierta_en`, `cerrada_en`
y `mesa_cambiada_en`, que son todos marcas de tiempo con la misma convención `_en`. No pueden ser el mismo
campo: o falta el instante de la fusión, o falta el puntero a la cuenta absorbente.

**El KDS nunca se entera de la fusión.** Toda la maquinaria de re-etiquetado que ADR-0025 construyó
—`mesa_anterior`, `mesa_cambiada_en`, y la regla `mesa_cambiada_en > Comanda.creada_en`— está definida
**solo para mover**. Pero la fusión también cambia de mesa a las comandas: las de la cuenta absorbida
pasan a una cuenta que está en otra mesa.

Y no es un caso borde: **toda fusión es entre mesas distintas, siempre.** El índice único de ADR-0017
impide que un mesero tenga dos cuentas abiertas en la misma mesa, así que dos cuentas fusionables nunca
comparten mesa. El hueco aplica al **100%** de las fusiones.

Es exactamente la falla que ADR-0025 existe para prevenir —*"un cambio de mesa que solo se distinga por
color es un plato que sale a la mesa equivocada"*—, y en la fusión ni siquiera se distingue por color.

Lo decisivo es que **no se arregla a nivel de `Cuenta`**. Las comandas absorbidas pasan a la cuenta
sobreviviente, cuyos `mesa_anterior` y `mesa_cambiada_en` describen **su propia** historia, no la de
ellas. El dato *"estas comandas venían de la mesa 6"* no tiene dónde vivir.

## Decisión

**Tres correcciones, y la tercera mueve la marca de lugar.**

```
1 ─ El predicado es positivo, no negativo

    UNIQUE (mesa, mesero) WHERE estado IN (abierta, en_cobro)

    Mesa.estado (derivado):
      0 cuentas en (abierta, en_cobro)   → libre
      ≥ 1                                → ocupada

2 ─ fusionada_en se parte en dos

    Cuenta.fusionada_en    → timestamp de la fusión
    Cuenta.absorbida_por   → FK a la cuenta que la absorbió

3 ─ La marca de cambio de mesa vive en la comanda

    Comanda.mesa_en_creacion   → la mesa para la que se creó

    KDS: orden pendiente  y  mesa efectiva ≠ mesa_en_creacion
         → muestra la mesa nueva con la anterior tachada al lado
```

Y una regla de propiedad que hasta ahora estaba implícita: **la cuenta absorbida conserva su `mesa`.** Esa
cuenta existió en esa mesa y reescribirlo sería falsificar dónde ocurrió. Lo que se mueve son sus
**comandas**, que pasan a la cuenta sobreviviente — y por eso su mesa efectiva cambia y el KDS lo marca.

El predicado positivo no es cosmético. `estado <> cerrada` es una lista negra: cada estado nuevo que
alguien agregue entra solo, en silencio, y rompe la regla — que es exactamente lo que pasó con
`fusionada`. `estado IN (abierta, en_cobro)` es una lista blanca: un estado nuevo queda afuera por
omisión, y si tiene que entrar, alguien lo escribe a mano.

## Alternativas consideradas

- **Marcar la cuenta absorbida como `cerrada` en vez de `fusionada`**, eliminando el cuarto estado y con
  él todo el problema del predicado. Viable y tentador por lo simple. No se eligió porque `cerrada`
  significa **cobrada** en todo el resto del sistema —la escribe la transacción del cobro junto con
  `Venta.cerrada_en`— y una cuenta fusionada no se cobró: aparecería como venta cerrada sin venta, en el
  cierre de turno y en el dashboard. Se cambiaría un estado incómodo por una mentira contable.

- **Mover la cuenta absorbida a la mesa de destino**, dejando todo el rastro de la fusión en una sola
  mesa. Viable y hacía que el predicado viejo no molestara. No se eligió porque falsifica el hecho: esa
  cuenta se abrió y se atendió en otra mesa, y el sistema tiene que poder decir dónde.

- **Replicar en la comanda el par que ADR-0025 ya usa en la cuenta** —`mesa_anterior` + `reasignada_en`—
  y mantener la regla temporal del KDS. Viable y más fiel a lo existente. No se eligió porque usa dos
  campos y una comparación de timestamps para expresar lo que un snapshot expresa con un campo y una
  igualdad, y porque **arrastra un defecto que el par ya tiene**: una cuenta movida dos veces pisa
  `mesa_anterior` y pierde la mesa original. El snapshot no se pisa nunca.

## Consecuencias

- **La mesa de origen se libera sola**, que es lo que el PRD promete y lo que el criterio de aceptación
  ya exigía. Y el mesero puede volver a abrir cuenta ahí.

- **Una sola regla del KDS cubre mover y fusionar.** Antes había una regla que cubría un caso y ninguna
  que cubriera el otro; ahora hay una que cubre los dos, y es más corta: comparar dos números en vez de
  ordenar dos instantes.

- **El cambio de mesa repetido deja de perder información.** Con el par de ADR-0025, mover una cuenta de
  la 6 a la 5 y después a la 9 dejaba `mesa_anterior = 5` y borraba el 6. El snapshot conserva la mesa
  original, que es la que el cocinero vio cuando leyó la comanda.

- **El predicado positivo hace la clase de error imposible en vez de improbable.** El próximo estado de
  `Cuenta` que alguien agregue no va a colarse en la definición de "mesa ocupada".

- **Costo: `Cuenta.mesa_anterior` y `mesa_cambiada_en` pierden la justificación que tenían declarada.**
  `TECH-DESIGN.md` dice que existen *"para que el KDS muestre el cambio a cocina, no para reportar"*, y
  el KDS deja de usarlos. Se conservan como **historia de la cuenta** —sirven para explicar por qué la
  rotación de esa mesa se ve rara— pero su motivo cambió y hay que decirlo, o el próximo lector va a
  creer que el KDS depende de ellos.

- **Costo: `mesa_en_creacion` duplica un dato que en el instante de crearse es derivable.** Es un snapshot
  deliberado, del mismo tipo que `precio_unitario_snapshot` en `ItemComanda`: guarda lo que era cierto
  cuando el hecho ocurrió, precisamente porque después va a cambiar.

- **Costo: la rotación de mesas suma una segunda forma de distorsión.** ADR-0025 ya declaró que una cuenta
  movida acumula todo su tiempo en la mesa destino. La fusión agrega la suya: la cuenta absorbida **no
  tiene `cerrada_en`** —no se cobró, se fusionó—, así que no aporta ninguna duración y su mesa no registra
  nada. Las dos distorsiones pegan en las noches movidas, que son las que uno querría analizar.

- **Costo: toda consulta de cuentas abiertas tiene que migrar al predicado nuevo**, incluidas las del
  cierre de turno y las del dashboard. Es un cambio mecánico, pero es en todos lados a la vez.
