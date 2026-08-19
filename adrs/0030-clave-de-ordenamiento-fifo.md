# ADR 0030: El consumo FIFO se ordena por número de lote, no por fecha de compra

## Estado

Aceptado — cierra el hallazgo #8 de `REVISION-ADVERSARIAL.md`. Completa **ADR-0007**, que decidió cómo se
serializa el consumo pero nunca dijo **por qué campo se ordenan los lotes**.

## Contexto

ADR-0007 resolvió bien la concurrencia —`SELECT ... FOR UPDATE` sobre los lotes, con orden por ID de
insumo para eliminar interbloqueos por construcción— pero dejó sin decidir la clave de consumo.
`TECH-DESIGN.md` la fijó después: *"por fecha de compra y, a igual fecha, por número de lote — una clave
total, nunca ambigua"*, con un tratamiento explícito del caso retroactivo: *"una compra con fecha anterior
a consumos ya realizados se advierte: el lote pasa a ser el más antiguo con saldo y los próximos consumos
salen de él, pero las ventas cerradas conservan su costo"*.

Es una clave total y el caso está contemplado, así que el problema no es la ambigüedad. **El problema es
que esa combinación deja el libro en un estado que la propia regla ya no reproduce.** Después de insertar
una compra retroactiva, recorrer el libro aplicando *"el lote más antiguo primero"* da un resultado
distinto del que quedó escrito: los movimientos ya persistidos consumieron lotes que, bajo la regla
vigente, hoy deberían haber ido después.

Eso choca de frente con un criterio de éxito del PRD, que es una verificación **manual y explícita**:

> *"El costo de insumos de una venta calculado por el sistema coincide **exactamente** con el cálculo FIFO
> manual, en una muestra de 20 ventas que atraviesen al menos 2 lotes con precios distintos."*

Tras una sola compra retroactiva ese chequeo **falla por diseño** sobre las ventas anteriores a la
inserción, y falla **sin que nada esté roto**: el sistema hizo lo correcto en su momento. El criterio no
dice contra qué estado del libro se hace el cálculo manual, y había dos respuestas distintas.

Hay un agravante ya documentado: el prototipo de gestión implementa esa misma rama —ordena por fecha y
después por id—, así que ya existe código que hereda el comportamiento.

Al modelarlo se verificó algo que simplifica la decisión: **`Compra.fecha` no se usa para nada más que el
orden FIFO.** El costo del estado de resultados sale de `ItemVenta.costo_fifo_snapshot`, no de las
compras, así que cambiarle el rol a ese campo no arrastra ningún otro cálculo.

Y queda una pregunta de fondo que conviene contestar antes de elegir: **¿FIFO es una afirmación física o
una convención de costeo?** En un restaurante lo primero es incognoscible —nadie sabe de qué saco salió el
arroz— y el producto no lo necesita. Lo que sí necesita es que la convención sea **determinista y
reproducible**, porque de eso depende un criterio de éxito verificable.

## Decisión

**Los lotes se consumen en el orden en que fueron registrados. La clave es el número de lote, y nada más.**

```
orden de consumo = numero_lote ascendente

  Es un orden total por sí solo: no necesita desempate.

  Compra.fecha  → dato del negocio, informativo.
                  NO participa del ordenamiento.

  Una compra retroactiva entra como lote NUEVO, al final de la cola,
  cualquiera sea su fecha.
```

Con eso el libro es **siempre reconstruible**: aplicar la regla sobre los movimientos escritos devuelve
exactamente lo que está escrito, en cualquier momento y sobre el estado final. El criterio de éxito del
PRD queda verificable sin reconstruir historia y **sin reescribirse**.

`Compra.fecha` se sigue capturando, porque es cuándo el negocio efectivamente compró y el administrador
necesita ese dato. Simplemente deja de gobernar el consumo.

**La interfaz tiene que decirlo en el momento exacto.** Al registrar una compra con fecha anterior al
último consumo de ese insumo, el aviso deja de ser *"este lote pasa a ser el más antiguo"* y pasa a ser lo
contrario: **el lote entra al final de la cola de consumo, y su fecha es informativa**. Un aviso que diga
lo que ya no es cierto es peor que no tener aviso.

## Alternativas consideradas

- **Mantener el orden por fecha y acotar el criterio de éxito**, aclarando que la verificación manual se
  hace sobre el estado del libro **al momento de cada venta** y no sobre el estado final. Viable y más
  fiel al negocio: un lote comprado antes es genuinamente más viejo. No se eligió porque el entregable de
  este proyecto **es** esa verificación, y reconstruir el estado histórico del libro en veinte puntos
  distintos del tiempo la vuelve impracticable a mano. Se estaría eligiendo fidelidad sobre una propiedad
  física que el negocio no puede observar, a cambio de perder la única prueba que el producto ofrece de
  que su número es correcto.

- **Prohibir la compra retroactiva** — que `Compra.fecha` no pueda ser anterior al último consumo de ese
  insumo. Viable, y hace coincidir orden por fecha y orden por inserción para siempre, eliminando los dos
  problemas de raíz. No se eligió porque bloquea una corrección legítima y frecuente: el administrador que
  recibió mercadería el lunes y la registra el miércoles no podría cargarla, o tendría que **falsear la
  fecha**. Es estrictamente peor que la opción elegida, que le deja registrar la fecha real y no la usa
  para ordenar.

- **Reprocesar el libro al insertar una compra retroactiva**, recalculando los consumos posteriores para
  que la regla vuelva a cumplirse. Descartada de entrada: contradice ADR-0004 —las ventas cerradas
  congelan su costo— y ADR-0005, que es append-only sin excepciones. Sería reescribir la historia para que
  la regla cierre, cuando lo correcto es una regla que no necesite reescribirla.

## Consecuencias

- **El criterio de éxito del PRD vuelve a ser verificable, y sin condiciones.** Cualquiera puede tomar el
  libro en su estado final, aplicar la regla a mano y obtener exactamente los costos que el sistema
  registró. Era la única prueba que el producto ofrece de que su margen es correcto, y estaba rota.

- **La clave se simplifica: un campo, sin desempate.** El número de lote es un orden total por sí solo, así
  que desaparece la clave compuesta y con ella la posibilidad de que dos lotes del mismo día queden
  ambiguos.

- **Es coherente con la línea que el sistema ya venía sosteniendo.** ADR-0004 congela la venta cerrada,
  ADR-0005 es append-only sin reversas y ADR-0022 prohíbe la vigencia retroactiva. Los tres dicen lo mismo:
  **el pasado no se reescribe**. Ordenar por inserción es ese mismo principio aplicado al libro de
  movimientos — y era el único lugar donde el sistema todavía dejaba que un hecho nuevo cambiara el orden
  de los viejos.

- **Costo: "FIFO" deja de significar literalmente "el lote más antiguo" y pasa a significar "el primero
  registrado".** En la operación normal coinciden —una compra se registra cuando llega— y la diferencia
  aparece solo con registro tardío. Pero es una diferencia real y hay que nombrarla donde alguien la vea:
  en el aviso de la compra retroactiva, no en un pie de página.

- **Costo: `Compra.fecha` pasa a ser un campo que se pide y no gobierna nada.** Es exactamente la clase de
  campo que después alguien usa por error creyendo que ordena. Conviene que el modelo lo diga y que ninguna
  consulta de consumo lo toque.

- **Costo: un registro tardío cuesta el precio del lote nuevo, no el del viejo.** Si la mercadería olvidada
  era más barata, ese ahorro se refleja más tarde de lo que ocurrió. Es un desfase de atribución temporal
  acotado a los casos de carga tardía, y el PRD ya declara la disciplina de carga como riesgo conocido para
  recetas y compras.

- **Costo: hay código del prototipo de gestión que hereda la rama vieja.** `lotesFifo` ordena por fecha y
  después por id, así que hay que corregirlo cuando ese prototipo se implemente o se regenere.
