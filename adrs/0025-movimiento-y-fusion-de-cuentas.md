# ADR 0025: La cuenta se mueve de mesa, y se fusiona solo dentro del mismo mesero

## Estado

Aceptado. Cierra el último caso borde que el PRD tenía abierto. **Corregido por ADR-0027** en dos puntos:
`fusionada_en` se parte en un timestamp más `absorbida_por`, y la marca de cambio de mesa que el KDS lee
pasa a `Comanda.mesa_en_creacion` — porque este ADR la definió solo para *mover* y la fusión también
cambia de mesa a las comandas, en el **100%** de los casos.

## Contexto

El PRD listaba como caso borde *"mesa que se une a otra, o cliente que se cambia de mesa con pedido en
curso"*. Son **dos situaciones distintas** metidas en una línea, y solo se parecen en que las dos mueven
una cuenta:

- **El cliente se cambia de mesa.** Reasignar la cuenta a otra mesa.
- **Dos mesas se juntan.** Fusionar dos cuentas en una.

Con el modelo de ADR-0017 la primera es casi gratis: la mesa ya no tiene dueño ni estado propio, así que
mover una cuenta es cambiarle un campo y la mesa origen vuelve a *libre* sola, por derivación. La segunda
es la que tiene filo, porque si las dos cuentas son de meseros distintos reaparece la pregunta que la
v1.4 eliminó: de quién es la comisión y de quién la propina.

Y las dos arrastran un problema de cocina que ninguna interfaz de salón resuelve sola: **el KDS muestra el
número de mesa en Hero de 64–80px**. Si la mesa cambia después de enviada la comanda, el cocinero está por
sacar un plato a la mesa equivocada.

## Decisión

**La cuenta se puede mover de mesa siempre. La fusión existe solo entre cuentas del mismo mesero.**

```
Cuenta
  mesa
  mesa_anterior        → nuevo, para poder mostrar el cambio
  mesa_cambiada_en     → nuevo
  estado: abierta | en_cobro | cerrada | fusionada
  fusionada_en         → timestamp de la fusión        ← precisado por ADR-0027
  absorbida_por        → FK a la cuenta que la absorbió ← agregado por ADR-0027
```

- **Mover** reasigna `Cuenta.mesa` con todos sus ítems y comandas. La mesa origen queda libre sola si no le
  quedan otras cuentas — no hay nada que liberar a mano.
- **El KDS re-etiqueta las comandas pendientes de esa cuenta y marca el cambio**: muestra la mesa nueva
  con la anterior tachada al lado. ~~La marca aplica mientras `mesa_cambiada_en > Comanda.creada_en`~~ y la
  orden siga pendiente; una orden ya terminada no se re-etiqueta, porque el plato ya salió.
  > **Regla corregida por ADR-0027.** La condición vigente es `Comanda.mesa_en_creacion ≠ mesa efectiva`,
  > no la comparación de timestamps. El motivo: la regla original cubría **mover** y no **fusionar**, que
  > también cambia de mesa a las comandas y lo hace en el 100% de los casos, porque dos cuentas fusionables
  > nunca comparten mesa. El snapshot además sobrevive a un segundo cambio de mesa, que pisaba
  > `mesa_anterior`.
- **Fusionar** absorbe una cuenta dentro de otra del **mismo mesero**: los ítems y las comandas se
  conservan, la absorbida queda en estado `fusionada` con la referencia, y la resultante conserva el
  `abierta_en` **más antiguo** de las dos.
- **Cuentas de meseros distintos no se fusionan.** Cada uno cobra la suya.

## Alternativas consideradas

- **Solo cambio de mesa, sin fusión** — más simple y cubría el caso que el PRD nombra primero. No se
  eligió porque deja sin resolver el más frecuente de un sábado a la noche: dos mesas que se juntan porque
  llegó más gente. Ese grupo terminaría recibiendo dos cuentas del mismo mesero y pagando dos veces, que
  es exactamente el tipo de fricción que el producto viene a sacar del salón.
- **Fusión sin restricción, entre cuentas de meseros distintos** — cubría todos los casos físicos posibles.
  No se eligió porque **contradice el PRD v1.4 y ADR-0017**: reintroduce la transferencia de cuentas entre
  meseros que se eliminó, y con ella la pregunta de a quién le queda la comisión y la propina, que hoy no
  existe porque una cuenta tiene un solo dueño de punta a punta. No hacía falta pagar ese precio: si dos
  meseros atendieron dos grupos, que cada uno cobre el suyo no es una limitación, es lo correcto.

## Consecuencias

- El caso frecuente —se cambian de mesa, se juntan dos mesas del mismo sector— queda cubierto sin tocar el
  modelo de atribución. Comisión, propina y efectivo siguen colgando de una cuenta con un solo dueño.
- La liberación de la mesa origen **sale gratis**, porque el estado de la mesa se deriva de sus cuentas
  (ADR-0017). Con el modelo anterior habría hecho falta reasignar y desbloquear a mano.
- El cocinero deja de ser el último en enterarse: la marca de cambio de mesa vive en la superficie donde
  se decide a dónde va el plato.
- **Costo: dos acciones nuevas en la estación del mesero**, en medio del servicio y sobre una pantalla
  compartida que el PRD ya declara como cuello de botella.
- **Costo: la rotación de mesas queda distorsionada por los cambios.** Una cuenta que se movió acumula
  todo su tiempo en la mesa destino, así que esa mesa aparece más lenta y la de origen no registra nada.
  Es una métrica del dashboard que pierde precisión justo en las noches más movidas, que son las que uno
  querría analizar.
- **Costo: dos grupos atendidos por meseros distintos que se juntan reciben dos cuentas.** Está decidido y
  es coherente, pero es un caso real que el mesero va a tener que explicarle al cliente, y el sistema no le
  da ninguna salida.
- **Costo: `estado = fusionada` es un cuarto estado de cuenta** que todo reporte y toda consulta de
  "cuentas abiertas" tiene que contemplar. Una consulta que solo excluya `cerrada` va a contar cuentas
  fusionadas y duplicar totales.
