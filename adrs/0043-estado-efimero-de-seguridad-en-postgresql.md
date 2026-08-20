# ADR 0043: El estado efímero de seguridad vive en PostgreSQL, no en el proceso

## Estado

Aceptado — decidido por la propuesta del ítem #3 (`sdd/arranque-admin-dispositivo/proposal`, BACKLOG #3).
Da **mecanismo** a dos decisiones que ya estaban tomadas y que nunca dijeron dónde se guarda su estado: la
sesión de 60 minutos de `/admin` (**ADR-0031**) y la escalera de intentos con tres anclas (**ADR-0034**).
No reabre ninguna de las dos: no cambia la duración, ni la escalera, ni el ancla. Decide **dónde vive** lo
que las dos dan por existente.

## Contexto

ADR-0031 y ADR-0034 escribieron dos controles **con estado** y ninguno dijo dónde se persiste:

> *"sesión en cookie `httpOnly` con **60 minutos de inactividad**"* (ADR-0031)
>
> *"5 intentos fallidos → 60 s, cada bloqueo siguiente duplica la espera, con tope en 15 min, el contador
> se reinicia con un acierto"* (ADR-0031), sobre **tres anclas** —dispositivo, cuenta e IP— (ADR-0034)

Los dos son estado y no configuración. *Inactividad* obliga a recordar cuándo fue la última actividad de
esa sesión. *Cinco intentos* obliga a recordar cuántos van, y *duplicación* obliga a recordar cuántos
bloqueos hubo antes. Ninguno de los treinta y siete ADRs anteriores dice si eso vive en el proceso, en la
cookie o en la base. Es el hueco de mecanismo que este proyecto ya tiene diagnosticado dos veces: no
decidir mal, sino no propagar lo decidido hasta donde hace falta.

Y hay dos hechos del sistema que deciden la respuesta antes de que haya que elegirla por gusto.

**El primero: ADR-0037 puso el proceso en una plataforma donde la instancia se duerme.** Ese ADR lo
declaró como costo aceptado —*"las instancias que se duermen por inactividad hacen lenta la primera
petición después de un rato sin uso"*—, y de ahí sale una consecuencia que no se escribió: **un proceso
que se duerme y se reinicia pierde todo lo que tenga en memoria**. Un contador de intentos en memoria no
falla al reiniciarse; **se vacía**, y quien esté probando contraseñas recupera sus cinco intentos sin que
nada avise. ADR-0034 ya nombró exactamente esta forma de falla al declarar el costo de tener tres anclas:
*"un contador mal anclado no falla, simplemente no protege"*. Un contador volátil es esa misma falla por
otra puerta, y la ventana de reinicio no es rara: es la operación normal de la plataforma elegida.

**El segundo: la sesión de `/admin` tiene que poder morir antes de vencer.** ADR-0031 declaró la
contraseña del administrador como *"el único secreto fuerte del sistema"* y dejó el segundo factor fuera
de alcance con fundamento. Bajo esa apuesta, la rotación obligatoria del primer ingreso —y toda rotación
posterior— **tiene que invalidar las sesiones que ya estaban abiertas**, o rotar la contraseña deja de ser
un control y pasa a ser un trámite: el que ya está adentro sigue adentro. Revocar no es una propiedad que
una credencial autocontenida tenga; es una propiedad de algo que se puede tachar.

## Decisión

**Todo el estado de seguridad de vida corta se persiste en PostgreSQL. El proceso no guarda nada que no
pueda perder, y ninguna credencial lleva su autoridad adentro.**

```
sesion_admin     una fila por sesión de /admin
                 la cookie es un puntero; quién es y hasta cuándo lo dice la fila

bloqueo_acceso   una fila por (ancla, valor_ancla), con ancla ∈ dispositivo | cuenta | ip
                 el contador y la escalera de ADR-0031, una vez por sujeto
```

De la forma salen dos propiedades, y las dos son el motivo de la decisión:

**1 — La cookie no afirma nada.** Lleva un identificador y un secreto de alta entropía, y nada más. No
dice quién es su portador, no dice hasta cuándo vale y no se puede fabricar sin escribir en la base. El
servidor sigue siendo la única fuente de verdad (ADR-0013) también para la autorización, no solo para el
dominio.

**2 — Se revoca de a una.** Rotar la contraseña mata las sesiones abiertas de esa persona; cerrar sesión
es una escritura y no una espera; un dispositivo revocado deja de verificar en el acto (ADR-0036). Sin
fila, revocar es imposible o exige una lista negra, que es esta misma tabla con otro nombre y con la
lógica invertida.

**El costo se paga donde ya se estaba pagando.** El login de `/admin` ya consulta la base para encontrar
la `Persona`, y la verificación de dispositivo ya la consulta para leer su `token_hash`. Persistir el
estado de sesión y el contador no agrega un viaje a un camino que no lo tenía.

## Alternativas consideradas

- **Estado en memoria del proceso** —un `Map` de contadores y un `Map` de sesiones—. Viable, gratis, sin
  esquema, y la respuesta por defecto para un backend de un solo proceso. No se eligió porque ADR-0037
  eligió una plataforma donde **la instancia se duerme y se reinicia**: el contador se vacía sin que nada
  falle ni avise, y el reinicio es el momento más conveniente para atacar justamente porque no deja
  rastro. Tiene además una segunda consecuencia silenciosa: ata el sistema a un solo proceso para
  siempre, porque dos instancias serían dos contadores y cada uno concedería sus propios cinco intentos.

- **Cookie de sesión firmada, sin estado** —un JWT o una cookie firmada con un secreto del servidor—.
  Viable, y ahorra una consulta por request autenticado. No se eligió por dos motivos, y el segundo es el
  que decide. **(a)** Una credencial autocontenida **no se revoca**: la rotación obligatoria dejaría vivas
  las sesiones ya abiertas hasta su vencimiento, que es exactamente lo que la rotación viene a evitar; la
  salida habitual —una lista de sesiones invalidadas— es volver a tener la tabla, con la lógica al revés.
  **(b)** Exige **un secreto de firma nuevo, sin lugar donde vivir y sin historia de rotación**. Es
  literalmente el costo que ADR-0033 declaró y no resolvió para la clave privada de la CA —*"no vive en la
  base de datos ni tiene rotación definida acá"*— y que ADR-0037 eliminó del sistema a propósito, hasta
  devolverle a ADR-0031 su frase de que la contraseña del administrador es el único secreto fuerte.
  Reintroducir ese costo para ahorrarle una consulta a una pantalla de administración sería deshacer una
  decisión tomada, por comodidad.

- **Un almacén en memoria aparte —Redis o equivalente—**, con expiración nativa por clave. Viable y es la
  respuesta estándar del oficio. No se eligió porque agrega una pieza de infraestructura, un servicio más
  que puede estar caído y una segunda fuente de verdad de la autorización, para un sistema de cinco
  pantallas y un administrador. PostgreSQL ya está, ya es transaccional, y ya es donde viven `Persona` y
  `Dispositivo`: poner la sesión al lado de la persona no acopla nada que no estuviera acoplado.

- **Derivar el contador de una tabla de auditoría de intentos**, contando filas de los últimos N minutos
  en lugar de mantener un contador. Viable, y regala traza. No se eligió porque la escalera de ADR-0031
  **no es** *"N intentos en una ventana"*: es un contador que **se reinicia con un acierto** y un bloqueo
  que **duplica el anterior**. Derivar eso de un registro de intentos es una consulta agregada por cada
  intento y una regla más difícil de probar que la que reemplaza. La traza de intentos, si alguna vez hace
  falta, es una decisión aparte y no depende de ésta.

## Consecuencias

- **El límite de intentos sobrevive al reinicio**, que en esta plataforma no es un caso raro sino la
  operación normal. De los tres controles de ADR-0031 es el único cuyo valor entero depende de no
  olvidarse: una sesión perdida por un reinicio solo obliga a volver a entrar; un contador perdido por un
  reinicio **regala cinco intentos**.

- **La revocación existe como operación y no como aspiración.** Rotar la contraseña, cerrar sesión y
  revocar un dispositivo son escrituras con efecto inmediato, no esperas a que algo venza.

- **No aparece ningún secreto nuevo en el sistema.** No hay clave de firma que custodiar ni que rotar, así
  que la frase de ADR-0031 —*"la contraseña del administrador es el único secreto fuerte del sistema"*—
  sigue siendo cierta después de esta decisión, como quedó después de ADR-0037.

- **El estado de autorización es inspeccionable.** Se puede responder *"¿qué sesiones hay abiertas?"* y
  *"¿qué está bloqueado y hasta cuándo?"* con una consulta, y las pruebas pueden verificar el control
  mirando la base en vez de mirar el proceso (ADR-0038). Un control que no se puede observar tampoco se
  puede verificar.

- **Costo: dos consultas más en el camino del login** —leer el bloqueo y escribir el contador— y una por
  cada request autenticado de `/admin`. Se acepta porque `/admin` no es el camino caliente del sistema; el
  que sí lo es, el stream SSE, verifica contra `Dispositivo` con SHA-256 y no con un KDF, que es lo que
  ADR-0036 decidió y esta decisión no toca.

- **Costo: las tablas crecen y nadie las limpia.** Una sesión vencida y un bloqueo ya cumplido siguen
  ocupando su fila. **Acá no se define ninguna purga**: con un administrador y cinco pantallas el volumen
  es despreciable, pero es deuda declarada y no resuelta. Cuando exista, la purga es una decisión aparte,
  y tiene que respetar que borrar una fila de `bloqueo_acceso` **es** perdonar un bloqueo.

- **Costo: el contador por IP escribe una IP en la base.** Es un dato personal débil que entra al sistema
  por un control de seguridad y no por el producto, en un proyecto que cerró SEC-06 declarando
  minimización. Queda declarado; su retención no está definida acá y cae bajo la misma purga pendiente.

- **Costo: autenticar pasa a depender de que la base responda.** Si PostgreSQL no está, no hay login de
  `/admin` ni verificación de dispositivo. Ya era cierto —`Persona` y `Dispositivo` viven ahí, y ADR-0015
  declaró la dependencia dura de la red— así que esta decisión no agrega una dependencia nueva: extiende
  la que ya existía al último control que todavía podría haber vivido sin ella.
