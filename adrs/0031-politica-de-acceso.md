# ADR 0031: Tres capas de acceso — dispositivo, persona y llave de servicio

## Estado

Aceptado — cierra los hallazgos **#10** y **#11** de `REVISION-ADVERSARIAL.md`, que estaban acoplados: la
cadena de arranque del sistema pasa por la autenticación de `/admin`, así que ninguno de los dos se podía
cerrar solo. Completa **ADR-0014** y **ADR-0018**, y le da mecanismo al principio que **ADR-0016** ya había
elegido sin implementarlo.

## Contexto

La autenticación estaba decidida **solo para la estación del mesero** (ADR-0014: PIN de 4 dígitos, sesión
corta). Todo lo demás quedó abierto, y el sistema creció alrededor del hueco:

- **`/admin` no tenía política de acceso.** Es hoy la superficie de mayor consecuencia del sistema:
  gobierna la estructura de costos, el calendario de apertura —que es el divisor de **todo** el estado de
  resultados—, los parámetros de dinero, la liquidación de propinas y el PIN de cocina.
- **El canal SSE no tenía forma de autorizarse.** `EventSource` no admite headers, y las dos vistas de
  cocina **no tienen sesión a propósito** (ADR-0016). ADR-0018 dedicó una consecuencia entera a declarar
  que no lo resolvía.
- **No había arranque.** Vender comida exige servicio abierto → exige el PIN de cocina → lo define el
  administrador → desde `/admin`, que no tenía autenticación. La cadena se cerraba sobre sí misma y con la
  base vacía el sistema no podía vender comida.
- **El PIN de cocina no tenía formato** —los 4 dígitos son de `Persona`, y `CredencialCocina` es otra
  entidad— **ni límite de intentos**, igual que el del mesero.

Al modelarlo aparecieron dos cosas que ordenan la decisión.

**La primera: el principio ya estaba elegido y le faltaba el mecanismo.** ADR-0016 escribió que en cocina
*"lo que autoriza la escritura es que la estación esté iniciada y sea el dispositivo de la cocina —
**identidad de dispositivo y de ubicación física, no de persona**"*. Eso no era una observación de paso:
era una decisión de autorización que nunca se implementó.

**La segunda: la estación del mesero también necesita el stream sin persona.** Su sesión se cierra en cada
envío y por inactividad (ADR-0014), pero la grilla tiene que mostrar los platos agotados **antes** de que
nadie ponga su PIN. Si el stream dependiera de la sesión, la estación llegaría desactualizada a cada login.
O sea: ninguna de las cinco pantallas puede apoyar su suscripción en una persona.

**Y una restricción que decide `/admin`:** el PIN de 4 dígitos existe por una razón física —el mesero está
de pie, apurado, frente a una pantalla a la vista del salón—. El `DESIGN.md` dice que el administrador
*"trabaja solo y por sesiones largas"*. Ninguna de esas condiciones aplica, así que heredar el PIN sería
copiar una restricción sin su motivo.

## Decisión

**El acceso tiene tres capas, y cada una autoriza una clase distinta de cosa.**

```
DISPOSITIVO   qué pantalla es          → leer el stream SSE, ser /kds /cocina /estacion
PERSONA       quién opera              → vender, cobrar, cerrar turno, gestionar
LLAVE         qué ventana se abre      → abrir y cerrar el servicio de cocina

Ninguna capa hace el trabajo de otra. El dispositivo nunca autoriza una acción;
la persona nunca autoriza el stream.
```

**1 — Dispositivo.** Entidad `Dispositivo` (nombre, rol `estacion | kds | cocina`, `token_hash`,
`enrolado_en`, `revocado_en`). Se enrola una vez desde `/admin`; el token se muestra **una sola vez** y se
persiste hasheado, igual que el PIN. Viaja en cookie `httpOnly` de larga duración, que `EventSource` envía
sola y sin necesidad de headers. Autoriza **leer** el stream y presentarse como esa ruta. **No autoriza
ninguna acción.** Se revoca desde `/admin` cuando un equipo se pierde o se cambia.

**2 — Persona.** `/estacion` sigue con PIN de 4 dígitos y sesión corta, sin cambios (ADR-0014). **`/admin`
va con usuario y contraseña**, hasheada con un **KDF de memoria dura** —Argon2id o bcrypt, nunca un hash
rápido— y sesión en cookie `httpOnly` con **60 minutos de inactividad**: larga porque el administrador
trabaja por sesiones largas, acotada porque su pantalla también queda sola.

**3 — Llave de servicio.** El PIN de cocina pasa a **6 dígitos**. Se tipea dos veces por día y protege la
acción que corta la venta de comida de todo el salón, así que la fricción extra es nula y el espacio de
búsqueda es cien veces mayor. Sigue sin identificar a nadie (ADR-0018).

### Límite de intentos

```
5 intentos fallidos → el DISPOSITIVO queda bloqueado 60 s
cada bloqueo siguiente duplica la espera, con tope en 15 min
el contador se reinicia con un acierto
```

Es **por dispositivo, no por cuenta**, por una razón concreta: el PIN del mesero no identifica a nadie
hasta que acierta, así que no hay cuenta contra la cual contar. Y tiene dos consecuencias buscadas: una
estación bajo ataque **no arrastra a las otras dos**, y el bloqueo alcanza **solo al pedido de PIN o
contraseña**. **Marcar unidades nunca se bloquea**, así que un lockout no puede dejar a la cocina sin poder
cocinar.

### Arranque

La migración inicial crea **un administrador y nada más**. Su contraseña se genera al sembrar, se muestra
**una sola vez** y **debe rotarse en el primer ingreso**. No se crea ninguna `CredencialCocina` ni ningún
dispositivo: el administrador los define, que es exactamente el orden que el sistema ya declara.

Y no queda como conocimiento tribal: **la *revisión de pendientes* suma dos entradas** —*PIN de cocina sin
definir* y *ningún dispositivo enrolado*— junto a los platos sin receta y los insumos sin compras. El
sistema ya tenía la superficie para decir qué falta; solo faltaba que dijera esto.

## Alternativas consideradas

- **La red local como frontera de confianza**, dejando el SSE sin autorización y declarándolo como
  supuesto. Viable, gratis y defendible para un local único que no se expone a internet. No se eligió
  porque el stream transporta comandas, mesas, meseros y cambios de disponibilidad, y porque `/admin`
  —que gobierna el calendario que divide todo el estado de resultados— vive en esa misma red. Habría sido
  un riesgo declarado en lugar de un control, en el único punto del sistema donde el control es barato.

- **PIN largo para `/admin`** en vez de contraseña, por consistencia con el resto del sistema. Viable y con
  una interfaz ya diseñada. No se eligió porque la consistencia sería con la **forma** y no con el
  **motivo**: el PIN corto existe por la física del salón, y el administrador no comparte ninguna de esas
  condiciones.

- **Token de un solo uso en el query string** para autorizar el SSE, que es la otra salida habitual cuando
  `EventSource` no admite headers. Viable. No se eligió porque los tokens en la URL terminan en logs,
  historiales y referers, y porque exigía un endpoint extra para emitirlos — más piezas para resolver lo
  que una cookie resuelve sola.

- **Sesión de dispositivo emitida por el PIN de cocina**, que ADR-0018 ya había evaluado y descartado.
  Se mantiene descartada por el mismo motivo: reintroduce en cocina algo que se puede perder, y una recarga
  del navegador obligaría a retipear el PIN con las manos ocupadas.

## Consecuencias

- **El hallazgo #6 original queda cerrado del todo.** Era el más antiguo del proyecto: la autenticación
  estaba decidida solo para la estación. Ahora las cinco superficies tienen política.

- **El principio de ADR-0016 pasa de declaración a mecanismo.** *"Identidad de dispositivo y de ubicación
  física"* dejaba de ser una frase y pasa a ser una credencial que se enrola, se revoca y se puede auditar.

- **Cocina conserva intacto lo que la hacía funcionar.** No gana sesión de persona, no se desloguea, y el
  marcado sigue sin pedir nada. La cookie de dispositivo no expira en pleno servicio ni se pierde con una
  recarga.

- **El arranque deja de ser un agujero y se apoya en una superficie que ya existía.** La revisión de
  pendientes ya listaba lo que falta cargar; ahora también lo que falta configurar.

- **Costo: una entidad y un flujo nuevos.** `Dispositivo` hay que enrolarlo, revocarlo y explicarlo. En un
  local con cinco pantallas es trabajo de una vez, pero es una pantalla más en `/admin` y un estado más que
  puede quedar mal cargado.

- **Costo: un dispositivo enrolado es un secreto en un equipo físico.** Si alguien se lleva la tablet de la
  cocina, se lleva la lectura del stream hasta que se revoque. Es estrictamente mejor que hoy —hoy no hay
  nada que revocar— pero no es una garantía, y la revocación depende de que alguien note la pérdida.

- **Costo: la contraseña del administrador es el único secreto fuerte del sistema, y no tiene segundo
  factor.** Queda declarado como fuera de alcance para un trabajo académico de local único. Si alguna vez
  este sistema saliera a producción, es la primera pieza a revisar, junto con la emisión electrónica.

- **Costo: el bloqueo por dispositivo se puede usar para molestar.** Alguien que tipee PINs equivocados a
  propósito puede dejar una estación fuera de servicio un rato. Se acepta: son tres estaciones, el bloqueo
  no impide cobrar en las otras, y el remedio de un local es humano.
