# ADR 0011: Los importes son enteros en unidad mínima

## Estado

Aceptado — **completado por [ADR-0032](0032-regla-de-redondeo.md)**, que fija la regla de redondeo y su
punto de aplicación. Este ADR eligió la representación; el 0032 decide qué pasa cuando una fracción cae
sobre ella.

## Contexto

Los criterios de éxito del PRD exigen "diferencia 0" en el costo FIFO, el arqueo, la comisión y el
estado de resultados. JSON no tiene decimales exactos y JavaScript no tiene decimal nativo, así que el
contrato debe elegir explícitamente una representación que no pierda precisión.

## Decisión

Todo importe viaja y se almacena como entero en la unidad mínima: `1050` significa S/ 10.50. Las
cantidades de receta usan su propia unidad entera —gramos, mililitros, unidades— y no se tratan como
importes.

## Alternativas consideradas

- **String decimal** (`"10.50"`) — viable: precisión arbitraria, legible al depurar, y parseable a un
  decimal exacto de ambos lados. No se eligió porque deja de ser un número en JSON, de modo que
  ordenar, comparar o sumar exige parsear primero, en todos los puntos del código.
- **`number` de JavaScript** — descartada de entrada: el punto flotante binario no representa 0.1
  exactamente y convierte un arqueo cuadrado en un descuadre de un céntimo, que es precisamente lo que
  el PRD prohíbe.

## Consecuencias

- Elimina por construcción una clase entera de errores de redondeo.
- Coincide con la convención de las pasarelas de pago, de modo que una integración futura no requiere
  traducción.
- Costo: toda presentación debe dividir y todo ingreso del usuario debe multiplicar. Un solo punto que
  lo olvide produce un error de factor 100 — más visible que un error de redondeo, pero igual de real.
- Costo: los porcentajes (comisión 5%, IGV 18%, merma) producen fracciones al aplicarse sobre enteros, y
  la representación entera **no dice sola** qué hacer con ellas. **Resuelto en ADR-0032**: una función
  única —medio hacia arriba— y dos familias según haya o no un total que respetar. Mientras estuvo sin
  decidir, dos caminos distintos daban resultados distintos por un céntimo.
- Costo: la unidad mínima es **demasiado gruesa para algunos cocientes**, y no todo cociente de dinero es
  dinero. El costo por gramo de un insumo vive por debajo del céntimo, así que persistirlo como entero en
  céntimos introduce un error de costeo de varios puntos porcentuales. ADR-0032 lo resuelve no
  persistiendo ningún costo unitario: la fracción vive dentro del cálculo y solo se redondea el importe
  final, que sí es dinero.
