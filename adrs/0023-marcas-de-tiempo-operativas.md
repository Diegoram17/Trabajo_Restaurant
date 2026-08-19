# ADR 0023: Las duraciones se miden con marcas en la entidad dueña del hecho

## Estado

Aceptado. **Precisado por ADR-0028**: la **hora** de una franja sigue siendo la del reloj de pared, pero el
**día** al que esa franja pertenece es el día operativo. El eje horario de una jornada va de **05:00 a
04:59**, de modo que la noche no queda partida entre dos fechas.

## Contexto

El dashboard del PRD v1.6 promete tres análisis que son duraciones, no importes: **tiempos de cocina**
(comanda enviada → orden terminada), **% de comandas demoradas** y **rotación de mesas** (cuenta abierta →
cuenta cobrada). Al revisar qué de eso es computable hoy:

- `Comanda` ya tiene `creada_en` y `terminada_en`, así que los tiempos de cocina y el % de demoradas
  **salen gratis** con el modelo actual.
- `Cuenta` **no tiene ninguna marca de tiempo**. La rotación de mesas no es computable.

Apareció además un problema que no estaba a la vista: *ventas por día y hora*, que ya estaba en alcance,
hoy solo puede apoyarse en `Venta.cerrada_en` — **la hora en que el cliente pagó**, no la hora en que
consumió. En un restaurante de salón esas dos horas se separan por una comida entera, así que la curva
horaria del negocio estaría corrida.

Hay una tentación razonable de resolver todo esto sin tocar el modelo: `EventoOperacion` ya existe, es
append-only y persiste toda la actividad (ADR-0009), así que cualquier duración se podría reconstruir de
ahí.

## Decisión

**Cada duración se mide con marcas de tiempo en la entidad dueña del hecho.**

```
Cuenta
  abierta_en     ← nuevo
  cerrada_en     ← nuevo

Comanda
  creada_en, terminada_en        ya existían

rotación de mesa   = Cuenta.cerrada_en − Cuenta.abierta_en
tiempo de cocina   = Comanda.terminada_en − Comanda.creada_en
demorada           = ahora − Comanda.creada_en > umbral, mientras siga pendiente
ventas por hora    = Cuenta.abierta_en   (hora de consumo, no de pago)
```

**`EventoOperacion` no es fuente de reportes** y esta decisión no lo convierte en una.

## Alternativas consideradas

- **Derivar las duraciones del registro de eventos** — viable y con un beneficio real: cualquier métrica
  futura se reconstruye sin migrar nada, incluso métricas que a nadie se le ocurrieron todavía. No se
  eligió porque `EventoOperacion` se diseñó para **reanudar el KDS tras una desconexión**, no para
  agregar: su payload es JSON sin índices analíticos, y una consulta de rotación de mesas sobre un mes
  entero tendría que escanearlo y desarmarlo. Y más importante: no tiene política de retención decidida,
  así que el día que alguien lo purgue para recuperar espacio se lleva puestos todos los reportes
  históricos. Convertir un log de tiempo real en la fuente del dashboard es una decisión grande, y no
  conviene tomarla de costado.
- **Ambas cosas** — columnas para lo que el dashboard usa hoy y el log como red para lo que venga. No se
  eligió porque deja dos fuentes para la misma pregunta sin ninguna regla que diga cuál manda cuando
  difieren, y el log seguiría igual de sin índices y sin política de retención. Es la opción que parece
  no elegir y en realidad elige las dos deudas.

## Consecuencias

- La rotación de mesas pasa a ser computable, y con una consulta trivial sobre dos columnas indexadas.
- **Se corrige un error que estaba latente en el alcance original:** *ventas por hora* deja de medir la
  hora del pago y pasa a medir la hora del consumo, que es la que sirve para decidir compras y horarios.
  Es el tipo de dato que si sale mal, sale mal en silencio y se usa igual.
- `EventoOperacion` conserva su propósito acotado —tiempo real y reanudación— y puede seguir siendo
  purgable sin consecuencias sobre los reportes.
- **Costo: cada métrica de duración nueva pide una columna nueva y su migración.** Si mañana se quiere
  medir "tiempo entre que la orden está lista y el mesero la retira", ese instante hoy no se registra en
  ningún lado y no hay de dónde reconstruirlo hacia atrás. La opción del log no tenía este costo, y es
  exactamente lo que se cambió por robustez.
- **Costo: `Cuenta.cerrada_en` duplica información con `Venta.cerrada_en`.** Son el mismo instante por dos
  caminos, y nada garantiza a nivel de esquema que coincidan. Deben escribirse en la misma transacción del
  cobro, y conviene un chequeo que lo verifique en las pruebas.
