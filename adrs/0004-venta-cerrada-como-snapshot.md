# ADR 0004: La venta cerrada es un snapshot inmutable

## Estado

Aceptado — **completado por ADR-0029**. El snapshot de este ADR había quedado incompleto en un punto: el
combo se guardaba como una sola línea, así que dos criterios del PRD obligaban a leer `ComboItem` **vivo**
y una edición de la composición movía los reportes históricos. Desde ADR-0029 el combo se descompone en
sus componentes al enviarse y ninguna consulta de reporte lo mira vivo.

## Contexto

El PRD exige que "al cerrarse, la venta congela su costo de insumos" y que "modificar la receta o el
precio de un plato no altera el margen de ninguna venta ya cerrada". Su criterio de éxito es
verificable: los reportes de un periodo cerrado deben dar idéntico resultado antes y después del
cambio.

La tesis del producto es que el margen sea un dato confiable, así que la reproducibilidad histórica no
es una comodidad: es el requisito central.

## Decisión

Al cobrar, la venta copia a sus propias tablas todo lo necesario para existir por su cuenta: precio
unitario, costo FIFO por ítem, venta neta, IGV, comisión calculada y la marca de crédito fiscal de los
lotes consumidos. Nunca se recalcula. Los reportes leen exclusivamente de esas tablas.

## Alternativas consideradas

- **Referencia con versionado temporal** — viable: platos y recetas versionados con vigencia, y la
  venta apuntando a la versión que regía en su momento. Más normalizado, sin duplicación, y permitiría
  responder "qué receta tenía este plato en marzo". No se eligió porque mete la dimensión tiempo en
  cada consulta de reporte, y hace que la reproducibilidad histórica dependa de que ninguna consulta
  olvide filtrar por vigencia — es decir, la convierte en disciplina en vez de estructura.

## Consecuencias

- La reproducibilidad histórica es una propiedad estructural: es imposible que un reporte de un
  periodo cerrado cambie, porque no hay nada que recalcular.
- Costo: duplicación deliberada de datos. El precio del plato vive en el menú y otra vez en cada ítem
  vendido. Un lector del esquema puede confundir cuál es la fuente de verdad para cada uso, y hay que
  documentarlo.
- Costo: corregir un error histórico —una compra mal cargada que ya fue consumida— no se propaga solo.
  Requiere un asiento de ajuste explícito, que el PRD ya listó como caso borde sin resolver.
