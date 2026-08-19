# ADR 0032: La regla de redondeo y su punto de aplicación

## Estado

Aceptado — cierra el hallazgo #9 de `REVISION-ADVERSARIAL.md`. Completa **ADR-0011**, que eligió la
representación entera pero dejó sin decidir qué ocurre cuando una fracción cae sobre ella.

## Contexto

ADR-0011 eligió enteros en unidad mínima y declaró su costo con precisión: *"los porcentajes producen
fracciones al aplicarse sobre enteros. Hay que fijar una regla de redondeo única y documentada, y
aplicarla siempre en el mismo punto del cálculo, o dos caminos distintos darán resultados distintos por
un céntimo"*.

Quedó bien identificado y **catalogado como riesgo**. No lo es. El PRD pone **"diferencia 0"** como
criterio de éxito en cuatro cálculos —costo FIFO, cierre de turno, comisión y estado de resultados—, así
que un céntimo de diferencia no es un riesgo tolerable: es un criterio incumplido.

Falta además la mitad menos visible: **el punto del cálculo donde se aplica**. Un IGV redondeado por ítem
y sumado no da lo mismo que un IGV calculado sobre el total, y las dos formas son defendibles.

Al modelarlo aparece la distinción que ordena todo el problema: **no hay una clase de fracción, hay dos**,
y tratarlas igual rompe una de las dos.

- **Hay un total entero que respetar.** Un importe se parte en pedazos y la suma de los pedazos tiene que
  dar el importe exacto. El redondeo pedazo por pedazo **no alcanza**: la suma se va por unos céntimos y
  el invariante se cae. ADR-0029 ya se topó con esto al repartir el precio de un combo y tuvo que
  inventar una regla de residuo — pero la resolvió **solo para el combo**, y su propio texto lo dice:
  *"cubre el reparto del combo y no resuelve el hallazgo #9"*.
- **No hay ningún total que respetar.** Un porcentaje se aplica sobre una base y el resultado no le debe
  cuadrar a nada. Acá el reparto no aplica y lo único que hay que decidir es **en qué fila** se aplica.

Y hay un tercer punto, más escondido, que no aparece en el hallazgo y es el más caro de los tres.

**El costo por unidad de insumo es sub-céntimo por naturaleza.** Un lote de 1200 g comprado en S/ 50,00
son `5000 / 1200 = 4,1666` céntimos por gramo. `MovimientoInventario` tiene hoy un campo
`costo_unitario_aplicado`, y la convención de ADR-0011 obliga a que ese campo sea un entero en céntimos:
**4**. Un ceviche de 180 g queda costeado en `180 × 4 = 720` cuando su costo real es
`180 × 5000 / 1200 = 750`.

Son **30 céntimos de error sobre 750: un 4%**, en la única cifra que este producto viene a vender. Y el
error no se delata por ningún lado, porque el número que queda escrito es perfectamente plausible. El
problema no es la función de redondeo —con medio-arriba da 4 igual—: es la **granularidad**. Un céntimo
es una unidad demasiado gruesa para el costo de un gramo.

## Decisión

**Una función, dos familias, y ningún costo unitario persistido.**

### La función

```
Redondeo al céntimo más cercano, medio hacia arriba (half-up).
Única en todo el sistema, sin excepciones.
```

### Familia A — Reparto: hay un total entero que respetar

```
1. truncar cada parte
2. residuo = total − Σ partes
3. asignar 1 céntimo por parte, en orden determinista, hasta agotar el residuo

Σ partes = total, por construcción. No por disciplina.
```

| Sitio | Orden de asignación del residuo |
|---|---|
| Precio de combo entre sus platos | Precio de lista descendente, empate por id de plato (ADR-0029) |
| Costo fijo mensual entre días operativos | Día operativo ascendente |
| Costo de un lote entre sus consumos | El consumo que **agota** el lote absorbe el saldo restante |

El tercer caso es el que cierra el libro: mientras el lote tenga saldo, cada movimiento se costea por
proporción; el movimiento que lo agota toma lo que quede. Con eso **la suma de los movimientos de un lote
es exactamente su costo**, siempre, sin excepción que mantener. Es el mismo principio que "el mes absorbe
el 100% del costo fijo", aplicado a otra escala.

### Familia B — Porcentaje: no hay ningún total que respetar

```
Se aplica medio-arriba en la fila más fina donde el importe se persiste.
Todo nivel superior es una SUMA de esos enteros.
Ningún reporte recalcula un porcentaje sobre un agregado.
```

| Sitio | Fila donde se aplica |
|---|---|
| IGV 18% | Por unidad, en `ItemVenta.igv_unitario` |
| Comisión 5% | Por venta, en `Comision.monto` |
| Merma estimada | Por `ItemVenta`, sobre su `costo_fifo_snapshot` |
| Neto de compra con crédito fiscal | Una sola vez, al registrar la compra |

Con esto la reconciliación día → semana → mes deja de ser algo que hay que cuidar: **el mes es la suma de
los días**, no un recálculo que debería coincidir con ella.

**Alcance de la merma estimada.** Se aplica sobre el costo de insumos de las ventas, y **no** sobre las
mermas registradas ni sobre las pérdidas por anulación. Esas dos ya son pérdidas **medidas**: estimarles
una merma encima sería contar dos veces la misma plata.

### El costo unitario de insumo no se persiste

```
costo del movimiento = redondear( cantidad_consumida × costo_costeado_lote / cantidad_lote )

... y el movimiento que agota el lote toma el saldo monetario restante.
```

`MovimientoInventario.costo_unitario_aplicado` **desaparece**. En su lugar el movimiento guarda su
**costo total** ya redondeado, que es un importe de verdad y respeta ADR-0011 sin comprometer precisión:
la fracción vive dentro del cálculo y nunca se persiste.

El caso sin lote —stock negativo, ADR-0007— usa la misma proporción sobre el último lote conocido:
`redondear( cantidad × costo_costeado_ultimo_lote / cantidad_ultimo_lote )`. Como no hay lote que cerrar,
no hay residuo que absorber.

## Alternativas consideradas

- **Una sola regla para todo: redondear medio-arriba en cada cálculo, sin reparto.** Viable y mucho más
  fácil de explicar, que no es poco en un sistema que se verifica a mano. No se eligió porque los casos
  con total no cierran: el mes dejaría de absorber el 100% del costo fijo y la suma de los diarios no
  daría el mensual, que son dos criterios de éxito escritos del PRD. Además ADR-0029 **ya** tuvo que
  inventar el reparto para el combo, así que la regla única no evitaría la segunda doctrina: solo la
  dejaría sin nombrar, viviendo en un ADR y aplicándose en otros dos lugares por analogía.

- **Recalcular cada nivel del reporte sobre su propia base** —el IGV y la merma del mes calculados sobre
  el total del mes, no sumando los ítems—. Viable, y tiene un argumento genuino a favor: cada nivel queda
  individualmente correcto contra una verificación manual **de ese nivel**. No se eligió porque los
  niveles dejan de sumar entre sí, y el PRD exige explícitamente lo contrario. Se documenta igual porque
  es la opción que se elige **por accidente** cuando nadie declaró la regla: es lo que sale naturalmente
  de escribir cada consulta del dashboard por separado.

- **Redondeo medio par (bancario).** Viable y estrictamente superior en un eje: elimina el sesgo
  sistemático hacia arriba que medio-arriba introduce en agregados grandes. No se eligió porque la
  verificación que este producto ofrece es **manual** —"reproducible a mano, diferencia 0"— y nadie
  reproduce medio-par con una calculadora. Se estaría comprando exactitud estadística a cambio de la
  única prueba que el sistema da de que su número es correcto. Con un local y un mes, el sesgo es de
  céntimos; la verificabilidad es un criterio de éxito.

- **Costo unitario de insumo en entero escalado** (micro-céntimos por unidad base). Viable y de precisión
  equivalente a la opción elegida. No se eligió porque mete una **segunda unidad monetaria** en un
  código cuyo ADR-0011 existe precisamente para que haya una sola, y porque no hace falta: no persistir
  ningún costo unitario da la misma precisión sin unidad nueva. Un sistema con céntimos y micro-céntimos
  conviviendo es un sistema donde alguien va a multiplicar por el factor equivocado.

## Consecuencias

- **Los cuatro criterios de "diferencia 0" del PRD pasan a estar sostenidos por construcción y no por
  disciplina.** La reconciliación día/semana/mes, el cierre del lote y el reparto del combo cierran
  porque la regla los obliga, no porque alguien se acuerde de sumar en el orden correcto.

- **Desaparece un error de costeo del 4% que hoy estaba latente en el modelo.** No era hipotético:
  `costo_unitario_aplicado` como entero en céntimos lo producía en cualquier insumo cuyo costo por unidad
  base fuera menor a un céntimo, que es prácticamente todo insumo que se mide en gramos o mililitros.

- **La regla es una sola frase por familia**, lo que la hace enseñable y revisable en code review: *¿hay
  un total que respetar? Truncá y repartí. ¿No? Redondeá en la fila más fina y sumá para arriba.*

- **Costo: `MovimientoInventario.costo_unitario_aplicado` se elimina del modelo.** Es exactamente la clase
  de campo que después alguien agrega de nuevo "para poder ver el costo por gramo", reintroduciendo el
  problema. Que el modelo diga por qué no está.

- **Costo: hay que llevar el saldo monetario del lote, no solo el de cantidad.** El movimiento que agota
  el lote necesita saber cuánto costo queda sin asignar, así que el saldo del lote pasa a tener dos
  dimensiones. Es una consulta más en el camino caliente del consumo FIFO.

- **Costo: dos días operativos idénticos pueden diferir en un céntimo** por el reparto del residuo del
  costo fijo. Es visible en el dashboard para quien compare dos días con la misma venta, y es el precio
  de que el mes cierre exacto. La alternativa —que ningún día tenga el céntimo y el mes no cierre— es
  peor.

- **Costo: medio-arriba tiene sesgo sistemático.** En volumen alto, redondear hacia arriba acumula. Para
  un local y los períodos que este dashboard reporta el efecto es de céntimos, pero es real y está
  elegido a conciencia, no por omisión.

- **Costo: la merma estimada se calcula por `ItemVenta`, no sobre el total del período.** Son más
  operaciones de redondeo y el número final puede diferir en céntimos de lo que daría el cálculo directo
  sobre el agregado. Es el precio de que las vistas reconcilien, y hay que decirlo cuando alguien
  verifique la merma a mano contra `costo total × pct`.
