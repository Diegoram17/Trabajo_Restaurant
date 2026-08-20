# ADR 0039: El dinero es `integer` y los porcentajes son puntos básicos

## Estado

Aceptado — completa **ADR-0011**, que fijó la representación, y **ADR-0032**, que fijó el redondeo y su
único punto de aplicación. Ninguno de los dos bajó al tipo literal de columna, y ninguno decidió cómo se
guarda un porcentaje.

## Contexto

ADR-0011 decidió que **todo importe es un entero en unidad mínima**, nunca punto flotante. ADR-0032
decidió que hay **una sola función de redondeo y un solo lugar donde se aplica**. Entre esas dos
decisiones y el esquema real quedó un hueco: el `TECH-DESIGN.md` describe el modelo de datos en prosa
prescriptiva —*"enteros en unidad mínima"*, *"timestamptz"*— y **no contiene una sola línea de DDL**. El
ítem #1 es el primer lugar donde alguien tiene que escribir un tipo concreto.

Hay que despejar una confusión antes de decidir: **ADR-0003 menciona `NUMERIC` de precisión
arbitraria**, pero lo hace como *capacidad que justificó elegir PostgreSQL* frente a otros motores, no
como tipo mandatorio de columna. ADR-0011 es posterior y es el que gobierna la representación. No hay
contradicción entre los dos; hay una decisión que faltaba.

El segundo hueco es más peligroso, porque no estaba señalado en ninguna parte: **los porcentajes**. El
IGV del 18%, la comisión del 5% y la merma se aplican sobre importes enteros. Si el porcentaje se
guarda como decimal de punto flotante, el flotante vuelve a entrar al camino del dinero **justo en la
multiplicación**, que es el único paso que ADR-0011 existe para proteger.

## Decisión

**Los importes son `integer`, en céntimos.** **Los porcentajes son enteros en puntos básicos**: 18% se
guarda como `1800`, 5% como `500`.

Toda la aritmética del dinero queda en enteros de punta a punta. El porcentaje se aplica multiplicando
por los puntos básicos y dividiendo por 10 000, y esa división se resuelve con la **misma y única
función de redondeo de ADR-0032, en su único punto de aplicación**.

## Alternativas consideradas

- **`bigint` para los importes** — margen de sobra y aparentemente más seguro. No se eligió porque
  `node-postgres` devuelve las columnas `int8` **como cadena de texto**, para no perder precisión en
  JavaScript. Sumar dos importes deja de sumar y pasa a concatenar, en silencio y sin error. Evitarlo
  exige un override global del parser, que después esconde otras columnas `int8` legítimas. Se cambia un
  desbordamiento que no va a ocurrir por un error de tipo que sí ocurre.

- **`NUMERIC` para los porcentajes** — es aritmética decimal exacta, no flotante, así que el argumento
  del error binario no aplica. No se eligió porque la multiplicación devuelve `NUMERIC` y hay que volver
  a entero en céntimos: eso crea **un segundo lugar donde se redondea**, que es precisamente lo que
  ADR-0032 vino a impedir.

- **Guardar el porcentaje como entero simple** (18 en vez de 1800) — más legible. No se eligió porque no
  admite fracciones de punto, y la merma estimada es la clase de parámetro que tarde o temprano se
  quiere en 2,5%.

## Consecuencias

- **El techo por valor guardado es S/ 21 474 836,47.** Los costos indirectos mensuales y los salarios
  flat de un restaurante están tres o cuatro órdenes de magnitud por debajo.

- **Los agregados no desbordan.** `SUM` sobre una columna `integer` ensancha a `bigint` sola en
  PostgreSQL, así que un reporte anual no tiene el problema del valor individual.

- **Costo: si algún día el techo quedara corto, cambiar a `bigint` reescribe la tabla** y toma un
  bloqueo exclusivo. Con los volúmenes de un local es barato; no es gratis, y conviene no descubrirlo
  con la base llena.

- **Costo: los puntos básicos obligan a dividir por 10 000 en cada aplicación de porcentaje.** Es una
  operación más de la que se ve en el documento, y tiene que quedar dentro de la función de redondeo —
  si alguien divide por su cuenta antes, se rompe el invariante de ADR-0032 sin que nada se queje.

- **Costo: `1800` no se lee como "18%".** Un valor mal cargado por dos órdenes de magnitud es plausible
  a la vista. El rechazo de porcentajes fuera de rango que el `TECH-DESIGN.md` ya exige es lo que lo
  atrapa, y ahora es más necesario que antes.
