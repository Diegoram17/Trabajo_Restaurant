# Security Pass — POS para Restaurantes

Fecha: 2026-08-19

**Alcance revisado**

| Capa | Estado | Material |
|---|---|---|
| Producto / requisitos | Revisada | `PRD.md` |
| Arquitectura / diseño | Revisada | `TECH-DESIGN.md`, `adrs/0001`–`0032` |
| Specs / tareas | Revisada parcialmente | `BACKLOG.md` y los *criterios de aceptación por flujo* del `TECH-DESIGN.md`. No hay specs SDD formales todavía. |
| Código | **Omitida — no existe** | El proyecto es greenfield: el `TECH-DESIGN.md` lo declara y no hay fuentes, manifiestos de dependencias ni CI en el repositorio. |
| Tests | **Omitida — no existe** | Sin código no hay suite. Los criterios de aceptación son la única verificación escrita. |
| Configuración / secretos | Revisada | `.gitignore`, `prototypes/` |

Los archivos de `prototypes/` se trataron como **referencia y no autoridad**, tal como declara el
`TECH-DESIGN.md`. Se revisaron únicamente en busca de secretos embebidos.

El pase original **no modificó nada del proyecto**: el único archivo escrito fue este reporte. Lo que
vino después está registrado abajo.

---

## Estado de avance

**HIGH** — **3 / 3 resueltos** (SEC-01, SEC-02, SEC-03)
**MEDIUM** — **4 / 4 resueltos** (SEC-04, SEC-05, SEC-06, SEC-07)
**LOW** — **3 / 3 resueltos** (SEC-08, SEC-09, SEC-10)

> **10 / 10 cerrados el 2026-08-19**, con cuatro ADRs y propagación a `TECH-DESIGN.md` y `PRD.md`. Ningún
> hallazgo quedó como riesgo aceptado sin declarar.

**Los cuatro ADRs que salieron del pase**

| ADR | Decisión | Cierra |
|---|---|---|
| [ADR-0033](adrs/0033-transporte-cifrado-y-atributos-de-sesion.md) | TLS con CA propia del local; `Secure`/`SameSite` en ambas cookies; validación de `Origin` | ~~SEC-01~~, ~~SEC-05~~ |
| [ADR-0034](adrs/0034-el-dispositivo-es-precondicion-del-pin.md) | El dispositivo es precondición del PIN, no de la contraseña | ~~SEC-03~~ |
| [ADR-0035](adrs/0035-el-evento-es-una-senal-y-el-stream-se-filtra-por-rol.md) | El evento es una señal de invalidación; el stream se filtra por rol | ~~SEC-02~~ |
| [ADR-0036](adrs/0036-el-hash-de-cada-secreto-lo-decide-su-entropia.md) | El hash lo decide la entropía; el token tiene ciclo de vida | ~~SEC-04~~, ~~SEC-10~~ |

Los cuatro restantes —~~SEC-06~~, ~~SEC-07~~, ~~SEC-08~~, ~~SEC-09~~— se cerraron sin ADR: criterios de
aceptación, tres campos en el modelo y dos entradas en el `PRD.md`. No requerían decidir nada nuevo de
arquitectura.

**SEC-03 se cerró sin agregar nada.** La respuesta ya estaba escrita en ADR-0031 —*"el PIN no identifica a
nadie hasta que acierta, así que no hay cuenta contra la cual contar"*— y solo faltaba aplicarla: esa
condición no se cumple para usuario y contraseña. Sumado a que `Dispositivo.rol` nunca tuvo el valor
`admin`, la cadena de arranque no estaba cerrada; se veía cerrada porque se le atribuyó a `/admin` un
requisito que su modelo nunca tuvo. No hizo falta sembrar un dispositivo ni inventar un modo de primer
arranque.

**SEC-02 resultó ser lo mismo, y resultó barato.** Se esperaba que fuera el más caro —separar eventos de
catálogo de eventos de cuenta, rozando una propiedad que ADR-0031 protegió a propósito—. No lo fue: la
decisión ya estaba tomada en **ADR-0013** (*"el cliente mantiene una caché de consultas que los eventos
invalidan"*) y nunca se había propagado al registro de eventos, donde **ADR-0009** la había redactado al
revés y el modelo de datos siguió esa lectura con un campo `payload`. Cerrado por **ADR-0035**: el evento
es una señal sin dominio y el stream se filtra por `Dispositivo.rol`. La tensión con ADR-0031 se disolvió
sola — una señal sin contenido no necesita saber de quién es la cuenta.

**Los tres HIGH salieron de la misma costura.** Ninguno era una decisión mal tomada: los tres eran
decisiones bien tomadas que no habían llegado hasta donde hacían falta. Es exactamente el diagnóstico que
`REVISION-ADVERSARIAL.md` ya había escrito —*"el modo de falla dominante no es decidir mal: es no propagar
lo decidido"*—, y el pase de seguridad lo confirma desde otro ángulo.

**Los seis restantes se barrieron en una pasada**, y cuatro de ellos también eran propagación:

| | Cerrado por | Y resultó que… |
|---|---|---|
| **SEC-04** + **SEC-10** | **ADR-0036** | iban juntos: no se puede elegir el hash del token sin saber su entropía, y su entropía nunca se había especificado. |
| **SEC-06** | `PRD.md` + criterios de cobro | el `PRD.md` ya había decidido la minimización de hecho —*"los tres opcionales, una boleta sin datos es válida"*—; faltaba decirlo como decisión y declarar propósito y retención. |
| **SEC-07** | `PRD.md` + modelo + criterios | el `PRD.md` ya exigía *"anulación de pedido con motivo registrado"* y el `TECH-DESIGN.md` nunca lo hizo criterio. Lo genuinamente nuevo fue `PerdidaPorAnulacion.mesero` y el corte por persona en el ranking. |
| **SEC-08** | modelo + criterios | el patrón de autoría ya existía en `CredencialCocina.actualizada_por` y `Turno.cerrado_por`; no se había aplicado donde la consecuencia es mayor. |
| **SEC-09** | criterios | ADR-0031 declaró la contraseña *"el único secreto fuerte del sistema"* y no exigió que lo fuera. |

**Ocho de los diez hallazgos eran una decisión que no había llegado hasta donde hacía falta.** Solo dos
—la política de datos personales y la atribución de anulaciones— fueron decisiones nuevas, y las dos son
de producto.

---

## Resumen ejecutivo

El proyecto llega a esta revisión con una política de acceso deliberada y bien argumentada
(ADR-0031), lo cual es inusual en un diseño previo a la implementación. La mayoría de los agujeros
clásicos de autorización ya están cerrados: la autorización se resuelve contra `Cuenta.mesero` y no
contra la mesa, las reglas de dinero viven solo en el servidor, y el rechazo de comandas ocurre en
el backend y no en la interfaz.

Los hallazgos de este pase se concentran en **una brecha estructural**: las tres capas de acceso
deciden con precisión *quién entra*, pero el diseño no dice casi nada sobre *qué se protege una vez
adentro*. Se manifiesta en tres lugares distintos que comparten la misma raíz — no hay decisión de
transporte cifrado (SEC-01), el canal SSE autoriza la suscripción pero nunca su contenido (SEC-02),
y el límite de intentos se ancla a una capa que quizá no esté presente cuando se autentica (SEC-03).

Fuera de eso hay dos huecos de producto que no son técnicos: el sistema recolecta documentos de
identidad y direcciones de clientes sin ningún requisito de tratamiento (SEC-06), y la operación que
permite que dinero cobrado desaparezca —la anulación— no se atribuye a ninguna persona en ningún
reporte (SEC-07), pese a que el PRD eliminó al cajero declarando explícitamente que el control
pasaba a ser "por atribución".

**No hay hallazgos CRITICAL.** El `PRD.md` establece que es un trabajo académico sin despliegue en
un local real, así que la probabilidad de explotación real está acotada por construcción. Las
severidades de abajo miden **consecuencia sobre el diseño**, que es lo que este proyecto todavía
puede corregir barato.

---

## Fortalezas de seguridad

Vale nombrarlas porque marcan qué **no** hay que tocar al remediar:

- **La autorización no se apoya en la interfaz.** Múltiples criterios exigen explícitamente que el
  rechazo ocurra en el servidor: *"Cobrar o editar la cuenta de otro mesero falla en el servidor, no
  solo en la interfaz"*, *"Fusionar cuentas de meseros distintos falla en el servidor"*, *"El rechazo
  ocurre en el servidor... una comanda enviada en el instante exacto del cierre se rechaza igual"*.
  ADR-0013 lo sostiene como principio.

- **El objeto de autorización es el correcto.** ADR-0017 decide que la unidad de propiedad es la
  cuenta y no la mesa, y el `TECH-DESIGN.md` lo blinda: *"ninguna consulta de autorización mira la
  mesa"*. Es exactamente la clase de decisión que evita un IDOR entero.

- **Enumeración de credenciales cerrada por criterio explícito.** *"Ni el PIN ni la contraseña
  revelan si el valor existe: el error es el mismo para inválido y para inexistente"*.

- **Secretos mostrados una sola vez y persistidos hasheados**, de forma consistente en los tres
  tipos de credencial (contraseña sembrada, PIN, token de dispositivo).

- **Los prototipos no contienen secretos.** Se buscaron patrones de clave, token y contraseña en los
  ~2 MB de `prototypes/` y no hubo ninguna coincidencia.

- **`.gitignore` bien construido para secretos**: cubre `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
  `secrets/`, `credentials.json` y `service-account*.json` **antes** de que exista código que los
  produzca.

- **La fricción es proporcional a la consecuencia.** ADR-0018 exige PIN solo en las dos acciones que
  cortan la venta de todo el salón y en ninguna otra, con confirmación explícita además en el cierre.

- **Los defaults son seguros.** *"Un plato nuevo arranca con `requiere_cocina` en verdadero: el
  default seguro es que necesite cocina, porque equivocarse hacia el otro lado lo deja vendiéndose
  con la cocina cerrada"*. El predicado de cuentas abiertas es lista blanca y no lista negra
  (ADR-0027), justamente para que un estado nuevo quede afuera por omisión.

- **El arranque no deja una credencial por defecto.** La migración crea un solo administrador con
  contraseña generada, mostrada una vez y de rotación obligatoria; no siembra `CredencialCocina` ni
  `Dispositivo`.

---

## Findings

### HIGH

#### [x] SEC-01 — No existe decisión de transporte cifrado, y sin ella la política de acceso de ADR-0031 no se sostiene

> **Resuelto por [ADR-0033](adrs/0033-transporte-cifrado-y-atributos-de-sesion.md)** — TLS con CA propia
> del local, certificado raíz instalado en las 5 pantallas durante el enrolamiento, y el backend no
> escucha en claro. Se descartaron la red local como frontera declarada y el certificado autofirmado; los
> motivos están en el ADR.

| | |
|---|---|
| **Severity** | HIGH |
| **Confidence** | HIGH |
| **Category** | Datos sensibles en tránsito sin protección / criptografía ausente |
| **Affected artifact** | Arquitectura — `TECH-DESIGN.md`, `adrs/0031-politica-de-acceso.md`, `adrs/0008-transporte-de-tiempo-real.md` |
| **Location** | `TECH-DESIGN.md` *Acceso: dispositivo, persona y llave de servicio*; `adrs/0031` §Decisión y §Alternativas consideradas |

**Description**

Ni el `PRD.md`, ni el `TECH-DESIGN.md`, ni ninguno de los 32 ADRs mencionan TLS, HTTPS, cifrado en
tránsito ni certificados de servidor. La única aparición de la palabra "certificado" en todo el
proyecto es `PRD.md:492`, sobre firma digital de comprobantes electrónicos — un tema distinto y
declarado fuera de alcance.

Esto no sería grave si el diseño hubiera elegido confiar en la red local. Pero eligió lo contrario, y
de forma explícita.

**Evidence**

ADR-0031 evaluó y **descartó** la red local como frontera de confianza:

> *"**La red local como frontera de confianza**, dejando el SSE sin autorización y declarándolo como
> supuesto. Viable, gratis y defendible para un local único que no se expone a internet. No se
> eligió porque el stream transporta comandas, mesas, meseros y cambios de disponibilidad, y porque
> `/admin` —que gobierna el calendario que divide todo el estado de resultados— vive en esa misma
> red."*

Y en su lugar puso credenciales que viajan por esa misma red en cada request:

> *"Viaja en cookie `httpOnly` de larga duración, que `EventSource` envía sola"* (token de dispositivo)
>
> *"La sesión vive en cookie `httpOnly` y expira a los 60 minutos de inactividad"* (`/admin`)

El `PRD.md` además declara la red local como dependencia operativa: *"Riesgo — dependencia de la red
local. Estaciones y KDS deben verse entre sí en todo momento; la calidad del wifi del local es un
requisito no funcional que el producto no controla"*.

**Attack scenario**

Un atacante en la wifi del local —un cliente sentado en el salón, con la clave del wifi de invitados
o sin ella si la red es abierta— pone la interfaz en modo monitor o hace ARP spoofing contra el
switch. Sin TLS:

1. Captura la cookie de dispositivo de cualquier pantalla en el primer request que pase. La cookie
   es de *larga duración*, así que sirve indefinidamente hasta que alguien revoque ese dispositivo —
   y nadie va a revocarlo, porque el equipo nunca se perdió.
2. Captura el PIN de 4 dígitos del mesero en el POST del login, en claro.
3. Captura la cookie de sesión de `/admin` y opera como administrador durante los 60 minutos de la
   ventana de inactividad, sin conocer la contraseña.

El atributo `httpOnly` no ayuda acá: protege contra lectura por JavaScript, no contra lectura por la
red. Y el atributo `Secure` —que sí impediría que la cookie salga por HTTP— es inaplicable sin
HTTPS.

**Potential impact**

Las tres capas de ADR-0031 se saltean simultáneamente con una sola posición de red. El control que
el ADR eligió *en lugar de* confiar en la red local resulta legible por cualquiera que esté en esa
red local. La decisión queda invertida respecto de su propia intención.

**Existing mitigation**

Ninguna en el diseño. Parcialmente compensado por el contexto: el `PRD.md` establece que es un
trabajo académico sin despliegue real, y ADR-0031 declara el sistema como de local único no expuesto
a internet.

**Recommended remediation**

Un ADR de despliegue que decida, como mínimo:

1. **TLS obligatorio en todo el tráfico**, incluido el canal SSE. En una LAN sin dominio público, la
   salida habitual es una CA interna con el certificado raíz instalado en las 5 pantallas — que son
   dispositivos enrolados y administrados de todos modos, así que el costo marginal es bajo.
2. **`Secure` y `SameSite` explícitos** en las dos cookies (ver SEC-05 para `SameSite`).
3. **Redirección o rechazo del tráfico en claro**, para que un fallo de configuración no degrade en
   silencio a HTTP.

Esto también cierra la mitad de seguridad del hallazgo #16 de `REVISION-ADVERSARIAL.md` ("no existe
ninguna decisión de despliegue"), que sigue abierto y del cual este hallazgo es la consecuencia
concreta sobre la política de acceso.

**Suggested verification**

- Una captura de tráfico entre una estación y el backend durante un login, un cobro y una
  suscripción SSE no debe contener el PIN, el token de dispositivo ni la cookie de sesión en claro.
- Una request HTTP en claro a cualquier endpoint debe fallar, no responder.
- Las dos cookies deben llevar `Secure` en las cabeceras `Set-Cookie`.

**Required change type** → `DESIGN / ADR CHANGE`

---

#### [x] SEC-02 — El canal SSE autoriza la suscripción pero nunca su contenido, y eso puentea la confidencialidad entre meseros

> **Resuelto por [ADR-0035](adrs/0035-el-evento-es-una-senal-y-el-stream-se-filtra-por-rol.md)** — el
> evento pierde el `payload` y pasa a ser una señal de invalidación; el cliente refetchea por tRPC, donde
> la autorización ya vive. El stream se filtra además por `Dispositivo.rol`, así que una pantalla de
> cocina no recibe ninguna señal de cuenta ni de cobro. La causa raíz no era el canal: era la
> contradicción entre ADR-0009 y ADR-0013 sobre qué transporta un evento.

| | |
|---|---|
| **Severity** | HIGH |
| **Confidence** | MEDIUM |
| **Category** | Dato sensible cruzando una frontera de confianza sin necesidad / control de acceso incompleto |
| **Affected artifact** | Arquitectura y specs — `TECH-DESIGN.md`, `adrs/0031`, `adrs/0008`, `adrs/0009` |
| **Location** | `TECH-DESIGN.md` *Acceso*, criterios 2 y 3; modelo de datos, `EventoOperacion` |

**Description**

El diseño tiene exactamente dos criterios de aceptación sobre el canal SSE, y **los dos hablan de
admisión**:

> - *"El token viaja en cookie `httpOnly` de larga duración, que `EventSource` envía sola: la
>   suscripción al canal SSE no requiere headers ni sesión de persona."*
> - *"Una suscripción al stream **sin dispositivo enrolado se rechaza**. Ninguna de las 5 vistas
>   recibe eventos sin credencial de dispositivo."*

Ninguno dice qué eventos recibe cada dispositivo una vez admitido. El alcance del contenido del
stream está **sin especificar**, y la lectura natural de un implementador —un canal, una secuencia
monotónica global, reanudación por `Last-Event-ID` contra esa secuencia— es que todos los
suscriptores reciben todo.

Eso choca de frente con una regla de confidencialidad que el mismo documento declara para el otro
canal.

**Evidence**

Por tRPC, la confidencialidad entre meseros es explícita:

> *"Un mesero **no ve** los ítems ni el total de la cuenta de otro, y la interfaz no le ofrece
> ninguna acción sobre ella."* (`TECH-DESIGN.md`, *Concurrencia entre estaciones*)

Por SSE no hay ninguna regla equivalente. Y `EventoOperacion` está modelado como una única secuencia
global —*"secuencia monotónica, tipo, payload, fecha"*— que ADR-0009 persiste y ADR-0008 empuja. La
reanudación *"usa `Last-Event-ID` contra la secuencia del registro de eventos"*, en singular.

El desbalance importa especialmente por qué dispositivos hay del otro lado. ADR-0016 y el
`TECH-DESIGN.md` describen `/kds` como *"la pantalla de pared, solo lectura y sin sesión"*, que *"no
pide identificación en ningún momento"* y *"no se desloguea ni se bloquea por inactividad, porque no
tiene sesión"*. Es el dispositivo con menos control de todo el sistema, y bajo la lectura natural
recibiría el mismo stream que una estación de mesero.

**Attack scenario**

Escenario A — el dispositivo robado que ADR-0031 ya contempla, pero con un alcance mayor al
declarado. El ADR acepta el riesgo así:

> *"Costo: un dispositivo enrolado es un secreto en un equipo físico. Si alguien se lleva la tablet
> de la cocina, se lleva **la lectura del stream** hasta que se revoque."*

Si el stream es global, "la lectura del stream" no es la cola de comandas: es la actividad completa
del local en vivo —qué mesa abrió qué cuenta, de qué mesero, con qué ítems y qué totales, y qué se
cobró—. El costo aceptado en el ADR se enunció sobre un alcance menor que el real.

Escenario B — sin robo. La pantalla de pared de la cocina está encendida todo el servicio, sin
sesión, sin bloqueo por inactividad y físicamente accesible a todo el personal de cocina y a
cualquier proveedor que entre. Abrir las herramientas de desarrollo en ese navegador expone el
stream en vivo. La regla *"un mesero no ve la cuenta de otro"* se sostiene en `/estacion` y se cae en
`/kds`.

**Potential impact**

Una frontera de autorización que el diseño se tomó el trabajo de definir con precisión en un canal
queda sin definir en el otro. El impacto directo es divulgación, no manipulación: el stream es de
lectura y el dispositivo *"no autoriza ninguna acción"*.

**Existing mitigation**

La capa de dispositivo impide que un no enrolado se suscriba, lo cual acota el problema a
dispositivos legítimos y equipos robados. La escritura sigue exigiendo su propia capa.

**Recommended remediation**

Decidir y escribir el **alcance del stream por rol de dispositivo**, con la misma explicitud que
tiene la regla de tRPC. Una asignación mínima consistente con el resto del diseño:

| Rol | Debería recibir |
|---|---|
| `kds` | Comandas con `requiere_cocina` pendientes y su re-etiquetado de mesa, anulaciones, apertura y cierre de servicio. Nada de dinero, nada de cuentas, nada de cobros. |
| `cocina` | Lo mismo que `kds`. |
| `estacion` | Disponibilidad de platos, estado del servicio de cocina, estado de mesas, y eventos de **las cuentas propias del mesero con sesión activa** — con el mismo predicado que ya usa tRPC. |

El punto de fricción real: ADR-0031 decidió que el stream no depende de la persona, justamente para
que la grilla muestre los agotados antes de que nadie ponga su PIN. Eso es compatible con lo de
arriba — los eventos de menú y de mesa **no necesitan persona**, y solo los de cuenta la necesitan.
El diseño puede conservar intacta su propiedad y aun así filtrar, si separa los eventos de catálogo
de los eventos de cuenta.

**Suggested verification**

- Un dispositivo enrolado con rol `kds` suscripto al stream durante un cobro completo **no recibe**
  ningún evento con ítems, totales ni pagos.
- Dos estaciones con dos meseros distintos con cuentas abiertas en la misma mesa: ninguna recibe
  eventos de la cuenta de la otra.
- La reanudación por `Last-Event-ID` respeta el mismo filtro que la suscripción inicial — un
  dispositivo no puede recuperar por reanudación lo que no podía recibir en vivo.

**Required change type** → `DESIGN / ADR CHANGE`

---

#### [x] SEC-03 — El límite de intentos se ancla al dispositivo, y el diseño no exige dispositivo para autenticarse

> **Resuelto por [ADR-0034](adrs/0034-el-dispositivo-es-precondicion-del-pin.md)** — verificar un PIN
> exige cookie de dispositivo y se rechaza antes de comparar; `/admin` no exige dispositivo y su contador
> va por cuenta y por IP. La cadena de arranque se abrió sola: no hizo falta sembrar un dispositivo ni un
> modo de primer arranque.

| | |
|---|---|
| **Severity** | HIGH |
| **Confidence** | MEDIUM |
| **Category** | Ausencia de límite efectivo sobre una operación sensible / bypass de control |
| **Affected artifact** | Arquitectura y specs — `adrs/0031-politica-de-acceso.md`, `TECH-DESIGN.md` |
| **Location** | `adrs/0031` §Límite de intentos; `TECH-DESIGN.md` *Acceso*, criterios de bloqueo |

**Description**

El límite de intentos está definido con cuidado y con una razón explícita para su alcance:

> ```
> 5 intentos fallidos → el DISPOSITIVO queda bloqueado 60 s
> cada bloqueo siguiente duplica la espera, con tope en 15 min
> el contador se reinicia con un acierto
> ```
>
> *"Es **por dispositivo, no por cuenta**, por una razón concreta: el PIN del mesero no identifica a
> nadie hasta que acierta, así que no hay cuenta contra la cual contar."*

El razonamiento es correcto. El problema es la dependencia que introduce: **si el contador vive en el
dispositivo, un intento sin dispositivo no tiene contador**.

Y el diseño nunca dice que autenticarse requiera un dispositivo enrolado. Dice lo contrario sobre la
dirección opuesta —que el dispositivo no autoriza acciones— pero no cierra esta:

> *"Autoriza **leer** el stream y presentarse como esa ruta. **No autoriza ninguna acción.**"*

Los cinco criterios de aceptación del bloqueo describen su comportamiento; ninguno establece que la
verificación de PIN o de contraseña sea inalcanzable sin cookie de dispositivo.

**Evidence**

- ADR-0031, §Límite de intentos: el contador es *"por dispositivo, no por cuenta"*.
- ADR-0031, §Decisión: el dispositivo *"no autoriza ninguna acción"* — el enrolamiento se describe
  como puerta del stream, nunca como precondición del login.
- `TECH-DESIGN.md`, *Acceso*: el criterio *"Una suscripción al stream sin dispositivo enrolado se
  rechaza"* existe **solo para el stream**. No hay un criterio simétrico para las mutaciones de
  autenticación.
- ADR-0010 elige tRPC como contrato: los procedimientos son endpoints HTTP alcanzables por cualquier
  cliente de la red local, no solo por la SPA.

**Attack scenario**

Un atacante en la red del local —el mismo escenario de SEC-01, y sin necesidad de TLS roto— llama
directamente al procedimiento tRPC de login desde un script, sin cookie de dispositivo.

Si el contador se busca por identidad de dispositivo y no hay dispositivo, hay dos implementaciones
naturales y las dos fallan:

- **Falla abierta**: sin dispositivo no hay contra qué contar, el intento pasa sin límite. El espacio
  del PIN de mesero es de 4 dígitos, y con *N* meseros activos cualquier acierto sirve porque el PIN
  no identifica hasta que acierta. Con 8 meseros, la probabilidad por intento es ≈ 1/1250: unos
  cientos de requests, segundos de trabajo. El resultado es una sesión de mesero legítima que puede
  cobrar, registrar propinas y cerrar turno.
- **Falla cerrada**: sin dispositivo no se puede autenticar nunca, lo cual es correcto en seguridad
  pero rompe el arranque descrito en el propio ADR — el administrador tiene que entrar a `/admin`
  para **enrolar el primer dispositivo**, y no puede hacerlo desde un dispositivo que todavía no
  existe.

Ese segundo caso es lo que hace que el hallazgo sea de diseño y no de implementación: la cadena de
arranque que ADR-0031 resolvió para `CredencialCocina` vuelve a aparecer acá, sin resolver.

**Potential impact**

Fuerza bruta sin límite efectivo contra el espacio de PINs, con acceso resultante a cobro,
recolección de efectivo y cierre de turno bajo la identidad de otra persona. Rompe la propiedad de
atribución sobre la que el `PRD.md` apoya todo su control tras eliminar al cajero.

**Existing mitigation**

El bloqueo funciona correctamente para el camino previsto: un atacante físico frente a una estación
enrolada queda limitado a 5 intentos por ventana, con tope de 15 minutos. El hallazgo es sobre el
camino no previsto.

**Recommended remediation**

1. **Exigir cookie de dispositivo válida para toda verificación de PIN o contraseña**, y escribirlo
   como criterio de aceptación simétrico al que ya existe para el stream.
2. **Resolver el arranque explícitamente**, igual que ADR-0031 hizo con el PIN de cocina. La salida
   más simple y coherente con lo ya decidido: la migración inicial siembra, junto al administrador,
   un **dispositivo de arranque** —o `/admin` acepta un enrolamiento inicial autenticado solo por la
   contraseña sembrada, una única vez, y la revisión de pendientes lo lista hasta que se resuelva—.
3. **Contador de respaldo por IP de origen** para intentos sin dispositivo, de modo que ninguna
   implementación pueda quedar sin límite alguno.

**Suggested verification**

- Una llamada al procedimiento de login sin cookie de dispositivo se rechaza antes de comparar el
  PIN, y el rechazo es indistinguible entre PIN válido e inválido.
- 200 intentos automatizados sin cookie de dispositivo no producen ninguna sesión válida y quedan
  limitados por el contador de respaldo.
- Desde una base recién migrada, el administrador puede enrolar el primer dispositivo sin
  intervención manual fuera del sistema — el mismo criterio que el `TECH-DESIGN.md` ya exige para el
  escenario simulado completo.

**Required change type** → `DESIGN / ADR CHANGE`

---

### MEDIUM

#### [x] SEC-04 — El requisito de KDF de memoria dura cubre uno de los cuatro secretos del sistema

| | |
|---|---|
| **Severity** | MEDIUM |
| **Confidence** | HIGH |
| **Category** | Criptografía débil o no especificada sobre credenciales |
| **Affected artifact** | Arquitectura y modelo de datos — `TECH-DESIGN.md`, `adrs/0031` |
| **Location** | `TECH-DESIGN.md` *Identidad y configuración* (`Persona`, `Dispositivo`, `CredencialCocina`) y *Acceso* |

**Description**

El sistema guarda cuatro secretos hasheados. El requisito de algoritmo está escrito para **uno solo**:

> *"`/admin` entra con usuario y contraseña, hasheada con KDF de memoria dura (Argon2id o bcrypt);
> nunca con PIN y **nunca con un hash rápido**."*

Para los otros tres, el diseño dice "hash" y nada más:

| Secreto | Espacio | Requisito de algoritmo escrito |
|---|---|---|
| Contraseña de `/admin` | Alto | **Argon2id o bcrypt, explícito** |
| `Persona.pin_hash` | 10⁴ | Ninguno |
| `CredencialCocina.pin_hash` | 10⁶ | Ninguno |
| `Dispositivo.token_hash` | Sin especificar (SEC-10) | Ninguno |

**Evidence**

- `TECH-DESIGN.md:120` — `Persona` … `pin_hash`, sin más calificación.
- `TECH-DESIGN.md:129` — `CredencialCocina` — `pin_hash` de 6 dígitos, sin más calificación.
- `adrs/0031:59` — el token de dispositivo *"se persiste hasheado, **igual que el PIN**"*. La
  referencia apunta a un requisito que tampoco existe: el PIN no tiene algoritmo definido, así que la
  frase hereda un vacío.
- `TECH-DESIGN.md:611` — *"Al regenerar un PIN se muestra una sola vez y se persiste su hash, nunca
  el PIN"* — correcto en el manejo, mudo en el algoritmo.

**Attack scenario**

Alguien obtiene una copia de la base —un volcado de respaldo, un `pgdata/` copiado, el acceso de un
tercero que administra el servidor—. Con un hash rápido (SHA-256, MD5) y sin sal por credencial:

- Los 10 000 PINs posibles de mesero se precomputan en milisegundos. Se recuperan **todos** los PINs
  activos de golpe, no uno.
- El PIN de cocina de 6 dígitos cae en el mismo orden de tiempo.

Y a diferencia de una contraseña filtrada, un PIN recuperado así no deja rastro de uso: la sesión
resultante es indistinguible de la legítima, que es justamente la propiedad sobre la que el `PRD.md`
apoya la atribución de ventas, comisiones y efectivo.

**Potential impact**

Compromiso simultáneo de la identidad de todos los meseros y de la llave del servicio de cocina, a
partir de un solo volcado. El impacto es idéntico al del "PIN prestado" que el `PRD.md` ya declara
como riesgo humano — pero acá es masivo y no requiere que nadie preste nada.

Nota honesta sobre la severidad: incluso con Argon2id, un espacio de 10⁴ es forzable offline por un
atacante con la base en la mano. El KDF **no** hace seguro un PIN de 4 dígitos contra un volcado;
sube el costo de segundos a horas y —lo importante— rompe la precomputación masiva, obligando a
atacar cada credencial por separado. Por eso esto es MEDIUM y no HIGH: cierra un multiplicador, no
el problema de fondo, que es estructural del PIN corto y ADR-0014 ya lo aceptó con razones físicas
válidas.

**Existing mitigation**

El límite de intentos protege el camino en línea (con la salvedad de SEC-03). No protege el camino
offline, que es el de este hallazgo.

**Recommended remediation**

1. **Extender el requisito de KDF de memoria dura a `Persona.pin_hash` y a
   `CredencialCocina.pin_hash`**, con sal única por credencial. Es una línea en el criterio de
   aceptación que ya existe, y no cuesta nada de diseño.
2. **Reemplazar la frase *"igual que el PIN"* de ADR-0031** por un requisito propio para
   `Dispositivo.token_hash`. Un token de alta entropía **no** necesita KDF —basta SHA-256 con sal,
   y es preferible por rendimiento en cada request del stream—, pero eso hay que decidirlo, no
   heredarlo por analogía. Depende de SEC-10.
3. **Sal única por credencial escrita explícitamente**, para que dos meseros con el mismo PIN —caso
   que el diseño ya prohíbe, pero por otra razón— nunca produzcan el mismo hash.

**Suggested verification**

- Dos credenciales sembradas con el mismo valor producen hashes distintos.
- El hash de un PIN no es reproducible con una función rápida sobre el valor en claro.
- Verificar un PIN tiene un costo medible por encima de un umbral definido (p. ej. > 50 ms), y ese
  costo está cubierto por un test.

**Required change type** → `SPEC CHANGE`

---

#### [x] SEC-05 — Autenticación por cookie sin ninguna defensa CSRF declarada

> **Resuelto por [ADR-0033](adrs/0033-transporte-cifrado-y-atributos-de-sesion.md)** — `SameSite=Strict`
> en `/admin`, `SameSite=Lax` en el dispositivo, `Secure` en ambas y validación de `Origin` en toda
> mutación tRPC. Se descartó el token anti-CSRF por formulario; el motivo está en el ADR.

| | |
|---|---|
| **Severity** | MEDIUM |
| **Confidence** | HIGH |
| **Category** | Falsificación de petición entre sitios / configuración insegura de cookies |
| **Affected artifact** | Arquitectura — `adrs/0031`, `adrs/0010-contrato-de-api.md`, `TECH-DESIGN.md` |
| **Location** | `TECH-DESIGN.md` *Acceso*; `adrs/0031` §Decisión |

**Description**

Las dos sesiones del sistema viven en cookies, y las mutaciones viajan por tRPC sobre HTTP. Es la
combinación exacta que habilita CSRF, y no hay ninguna mención de `SameSite`, de token anti-CSRF, de
validación de `Origin`, ni de la palabra CSRF en todo el proyecto — se buscó en `PRD.md`,
`TECH-DESIGN.md` y los 32 ADRs, con cero resultados.

**Evidence**

- ADR-0031: la sesión de `/admin` *"vive en cookie `httpOnly`"* con 60 minutos de inactividad; el
  token de dispositivo, en *"cookie `httpOnly` de larga duración"*.
- El único atributo de cookie especificado en todo el diseño es `httpOnly`, que no defiende contra
  CSRF: la cookie se envía igual en una petición originada por otro sitio.
- ADR-0010 elige tRPC. Sus mutaciones son POST con cuerpo JSON — enviables desde una página externa,
  y la respuesta ni siquiera hace falta leerla para que el efecto ocurra.

**Attack scenario**

El administrador tiene su sesión abierta —la ventana es de 60 minutos de inactividad, así que es una
superficie amplia— y en otra pestaña abre cualquier página externa. Esa página emite en segundo plano
una mutación contra el backend del POS, en la red local del atacante o adivinando el host. El
navegador adjunta la cookie de sesión sola.

Lo que gobierna `/admin` hace que valga la pena: la estructura de costos, **el calendario de apertura
—que el propio `TECH-DESIGN.md` describe como el divisor de todo el estado de resultados—**, los
parámetros de dinero, la liquidación de propinas, la rotación del PIN de cocina y la revocación de
dispositivos.

Y hay un agravante propio de este diseño: ADR-0022 impide corregir hacia atrás. Un
`CalendarioApertura` o una `ConfiguracionCostos` escritos por una petición falsificada **no se pueden
deshacer** — solo se puede crear una vigencia nueva hacia adelante. El daño de una escritura no
autorizada es permanente por decisión de arquitectura.

**Potential impact**

Escritura no autorizada sobre la configuración de mayor consecuencia del sistema, con el atenuante de
que requiere que el administrador tenga sesión activa y visite una página hostil, y el agravante de
que el resultado es irreversible.

**Existing mitigation**

Ninguna declarada. En la práctica, los frameworks modernos y los navegadores actuales aplican
`SameSite=Lax` por defecto, lo cual bloquea la mayoría de los vectores — pero eso es un default del
entorno, no una decisión del sistema, y no cubre subdominios ni peticiones del mismo sitio.

**Recommended remediation**

1. **`SameSite=Strict` en la cookie de sesión de `/admin`.** No hay navegación entrante legítima desde
   otro sitio hacia el panel, así que `Strict` no rompe nada.
2. **`SameSite=Lax` en la cookie de dispositivo**, que sí necesita sobrevivir a una navegación normal.
3. **`Secure` en ambas** — depende de SEC-01.
4. **Validación de `Origin` en toda mutación tRPC**, como red de seguridad que no depende del
   comportamiento por defecto del navegador.

**Suggested verification**

- Una mutación emitida desde un origen distinto, con cookie de sesión válida en el navegador, se
  rechaza.
- Las cabeceras `Set-Cookie` de ambas sesiones incluyen `SameSite` explícito y `Secure`.

**Required change type** → `SPEC CHANGE`

---

#### [x] SEC-06 — El sistema recolecta documentos de identidad y direcciones de clientes sin ningún requisito de tratamiento

| | |
|---|---|
| **Severity** | MEDIUM |
| **Confidence** | HIGH |
| **Category** | Privacidad — dato personal sin propósito, retención ni control declarados |
| **Affected artifact** | Producto y modelo de datos — `PRD.md`, `TECH-DESIGN.md` |
| **Location** | `PRD.md:259`; `TECH-DESIGN.md:317` (`Comprobante`) |

**Description**

`Comprobante` almacena datos personales de clientes:

> *"`boleta` acepta DNI, nombre y dirección; `factura` **exige** RUC, razón social y dirección
> fiscal."* (`TECH-DESIGN.md:317`)

En todo el proyecto no hay una sola mención de política de retención, de control de acceso a esos
datos, de minimización, de anonimización, ni de la normativa aplicable. Se buscó "datos personales",
"privacidad", "retención" y "29733" en `PRD.md`, `TECH-DESIGN.md` y los 32 ADRs: el único resultado
relacionado con retención es sobre el registro de eventos y el libro de movimientos, por motivos de
crecimiento — no de privacidad.

El contexto lo vuelve concreto y no teórico. El `PRD.md` sitúa el producto en Perú de forma
explícita: *"Contexto Perú. Boleta/factura, IGV, Niubiz y Yape sitúan el producto en Perú"*. La Ley
29733 de Protección de Datos Personales aplica a un banco de datos con DNI y domicilio de personas
naturales, e incluye obligaciones de finalidad, proporcionalidad y seguridad.

**Evidence**

- `PRD.md:259` — *"Boleta — DNI, nombre y dirección, los tres opcionales. Una boleta sin datos es
  válida."*
- `TECH-DESIGN.md:317` — el campo existe y en factura es obligatorio.
- `PRD.md`, *Supuestos y riesgos abiertos* — trece riesgos declarados, ninguno sobre datos de
  clientes. Los riesgos de datos que sí figuran son todos sobre exactitud contable, no sobre
  privacidad.
- No existe ningún criterio de aceptación que restrinja quién lee un `Comprobante`. El único control
  de lectura escrito en la capa de cobro es *"El mesero consulta la lista de mesas que **él** cobró en
  el turno en curso"*, que acota por turno y por mesero pero no menciona los datos del receptor.

**Attack scenario**

No hace falta un atacante externo. Un mesero con sesión activa, o el administrador, acumula sobre el
tiempo un banco de datos de DNI, nombres y domicilios de la clientela habitual, sin propósito
declarado más allá de imprimir un comprobante que **la v1 ni siquiera emite** —el `PRD.md` deja la
emisión electrónica explícitamente fuera de alcance—.

Ese banco no tiene fecha de expiración, no tiene control de acceso escrito y no tiene ninguna
justificación de retención. Sumado a SEC-01, viaja además en claro por la red del local cada vez que
se consulta un cobro.

**Potential impact**

Acumulación indefinida de datos personales identificables sin base declarada. Para un trabajo
académico el impacto real es nulo; para el mismo diseño llevado a un local real, es una obligación
legal incumplida por omisión de diseño, y es de las que no se arreglan después sin migrar datos.

**Existing mitigation**

Los datos de boleta son **opcionales** —*"Una boleta sin datos es válida"*—, que es minimización de
hecho aunque no esté declarada como decisión. Es la mitad del control ya presente.

**Recommended remediation**

Es una decisión de producto, no técnica. Lo mínimo para cerrarla:

1. **Declarar el propósito y la retención** de los datos del receptor en el `PRD.md`, junto a los
   otros supuestos: para qué se guardan y por cuánto tiempo. Si la v1 no emite, el propósito honesto
   es "insumo de una emisión futura", y eso ya sugiere la retención.
2. **Escribir la minimización como decisión**, no como accidente: en boleta los tres campos son
   opcionales *porque* se prefiere no recolectar, y la interfaz no debería pedirlos por defecto.
3. **Un criterio de aceptación de acceso**: quién puede leer los datos del receptor de un comprobante
   ajeno. El patrón ya existe en el sistema — *"el mesero consulta las mesas que él cobró"* — y solo
   hay que extenderlo a este campo.
4. **Nombrar la Ley 29733 en los supuestos**, aunque sea para declararla fuera de alcance con
   fundamento. Un riesgo declarado es una decisión; un riesgo ausente es un descuido.

**Suggested verification**

- Un mesero no puede recuperar los datos del receptor de un comprobante que no cobró él.
- El `PRD.md` tiene una entrada de supuesto sobre datos personales, con propósito y retención.

**Required change type** → `PRODUCT / REQUIREMENT CHANGE`

---

#### [x] SEC-07 — La anulación es la vía natural de fuga de efectivo, y ningún reporte la atribuye a una persona

| | |
|---|---|
| **Severity** | MEDIUM |
| **Confidence** | HIGH |
| **Category** | Abuso de funcionalidad legítima / control declarado que no existe |
| **Affected artifact** | Producto — `PRD.md`, `TECH-DESIGN.md` |
| **Location** | `PRD.md:469` (*Anulaciones y faltantes*), `PRD.md:688` (riesgo declarado), `TECH-DESIGN.md` *Anulación* |

**Description**

El `PRD.md` eliminó el rol de cajero y declaró explícitamente con qué lo compensaba:

> *"Riesgo — sin separación de funciones en el cobro. Al concentrar venta y cobro en el mesero se
> pierde el control cruzado que daba un cajero aparte; la trazabilidad se apoya solo en el PIN en
> sesión."*
>
> *"...supone confianza operativa y **control por atribución**, no por separación de funciones entre
> quien vende y quien cobra."*

El control elegido, entonces, es la atribución. Y funciona para la venta: hay *"Ranking de venta por
mesero"*, comisiones por mesero, cierre del día por mesero, horas por mesero.

Pero la operación que permite que dinero cobrado no llegue nunca a ser una venta **no está atribuida
a nadie**. El único reporte de anulaciones es por plato:

> *"**Anulaciones y faltantes.** Ranking de **qué se anula** y qué se marca sin insumo, con su motivo
> y su pérdida FIFO acumulada."* (`PRD.md:469`)

"Qué", no "quién".

**Evidence**

- `PRD.md:469` — el ranking es por ítem anulado, no por persona. Se verificó que no existe ningún
  otro reporte de anulaciones: la búsqueda de "por mesero" en `PRD.md` y `TECH-DESIGN.md` devuelve
  venta, comisiones, propinas, cierre del día y horas — nunca anulaciones.
- `TECH-DESIGN.md`, *Anulación* — siete criterios de aceptación. Ninguno registra ni reporta el autor
  de la anulación. `ItemComanda` tiene `motivo`, pero ningún criterio lo declara obligatorio para el
  estado `anulado` (sí lo declara para la merma y para *sin insumo*).
- `PerdidaPorAnulacion` guarda *"ítem anulado tras preparación, `costo_fifo`, motivo"* — sin persona.
- El estado de resultados agrega las pérdidas por anulación en una sola línea global.

**Attack scenario**

Un mesero toma el pedido, la cocina lo prepara y lo entrega, el cliente consume y paga en efectivo.
Antes de cerrar la cuenta, el mesero anula esa unidad. El sistema hace exactamente lo que se le pidió:

- La unidad no suma a la venta ni a la comisión — *"Ninguna unidad anulada suma a la venta ni a la
  comisión del mesero"*.
- El inventario ya se descontó y no se revierte — se registra una `PerdidaPorAnulacion` con su costo
  FIFO.
- El efectivo del cliente no está en ninguna parte del sistema, así que no falta en el cierre de
  turno: `a_entregar` se calcula sobre las ventas registradas, y esa venta no existe.

El dinero queda en el bolsillo y el libro cierra perfecto. La única huella es una pérdida por
anulación en un ranking agrupado por plato, indistinguible de un plato que se cayó al piso.

Repetido a bajo volumen es invisible: en un ranking por plato, una anulación por servicio se pierde
entre las legítimas.

**Potential impact**

El control que el `PRD.md` puso en lugar de la separación de funciones no cubre la operación que más
lo necesita. No es una vulnerabilidad técnica —el sistema funciona como está diseñado— sino un hueco
en el modelo de control, que es precisamente lo que esta capa del análisis busca.

**Existing mitigation**

Real y parcial: la anulación **deja rastro** en vez de borrar —*"El ítem anulado no se borra: queda
tachado en la cuenta"*, ADR-0005 es append-only sin excepciones—, y la pérdida entra al estado de
resultados como línea propia. Los datos para detectarlo existen; lo que falta es la consulta que los
cruza con la persona.

Eso hace que la remediación sea barata: no hay que cambiar el modelo, hay que agregar un corte.

**Recommended remediation**

1. **Registrar el autor de la anulación.** El dato está disponible en el momento —la anulación ocurre
   en `/estacion` con sesión activa— y `PerdidaPorAnulacion` es el lugar natural. Sin esto, ningún
   reporte es posible.
2. **Agregar el corte por mesero al ranking de anulaciones** que el `PRD.md` ya compromete. Es un eje
   más sobre un reporte que ya existe.
3. **Motivo obligatorio para anular**, con la misma regla que el `PRD.md` ya exige para la merma
   —*"sin él una merma es indistinguible de un faltante por robo"*, que es exactamente el mismo
   argumento— y para *sin insumo*.
4. **Actualizar el riesgo declarado en el `PRD.md`.** Hoy dice que la trazabilidad *"se apoya solo en
   el PIN en sesión"*, lo cual es cierto para la venta e incompleto para la anulación.

**Suggested verification**

- En un escenario simulado con dos meseros y varias anulaciones antes y después de preparar, el
  reporte identifica cuántas anuló cada uno y con qué costo acumulado.
- Anular sin motivo falla, igual que registrar una merma sin motivo.

**Required change type** → `PRODUCT / REQUIREMENT CHANGE`

---

### LOW

#### [x] SEC-08 — Las versiones de configuración no registran quién las creó

| | |
|---|---|
| **Severity** | LOW |
| **Confidence** | HIGH |
| **Category** | Ausencia de traza sobre una operación de alta consecuencia |
| **Affected artifact** | Modelo de datos — `TECH-DESIGN.md` |
| **Location** | `TECH-DESIGN.md` *Identidad y configuración* (`ConfiguracionCostos`, `CalendarioApertura`) |

**Description**

`ConfiguracionCostos` y `CalendarioApertura` se versionan por vigencia y son inmutables hacia atrás
(ADR-0022), lo cual es una decisión de integridad excelente. Pero ninguna de las dos guarda **autor**:

> *"`ConfiguracionCostos` — `vigente_desde`; salarios flat…, `pct_comision`, `pct_merma`, `pct_igv`."*
>
> *"`CalendarioApertura` — `vigente_desde`, `patron_semanal`, `excepciones[]`."*

El patrón de atribución **ya existe en el sistema** y se aplicó en otros lugares: `CredencialCocina`
tiene `actualizada_por`, `Turno` tiene `cerrado_por` y `motivo_cierre_tardio`. Simplemente no se
aplicó donde la consecuencia es mayor.

**Evidence**

El propio `TECH-DESIGN.md`, en *Riesgos técnicos abiertos*, describe la consecuencia:

> *"**El calendario de apertura mal cargado desplaza toda la utilidad, en silencio.** Si declara 30
> días operativos y el local abre 26, el costo fijo diario queda 13% bajo y cada día se ve más
> rentable de lo que es. Los totales del mes siguen cerrando, así que **el error no se delata por
> ningún lado**."*

Un cambio que desplaza toda la utilidad, es irreversible por ADR-0022 y no se delata solo, tampoco
registra quién lo hizo.

**Attack scenario**

Es más de investigación que de ataque. Detectado el desvío tres meses después, no hay forma de
distinguir un error de carga de un cambio deliberado, ni de saber en qué momento entró. Combinado
con SEC-05, una escritura por CSRF sería indistinguible de una acción legítima del administrador.

**Potential impact**

Imposibilidad de auditar el parámetro de mayor impacto del estado de resultados. Es LOW porque el
sistema arranca con un solo administrador, así que el conjunto de sospechosos es de uno — pero el rol
admite varias personas y el `TECH-DESIGN.md` no lo limita.

**Existing mitigation**

El versionado por vigencia conserva **qué** cambió y **desde cuándo rige**, que es la mitad del
problema. Falta quién y cuándo se escribió.

**Recommended remediation**

Agregar `creada_por` y `creada_en` a `ConfiguracionCostos` y `CalendarioApertura`, con el mismo
patrón de `CredencialCocina.actualizada_por`. Es un campo por tabla y ninguna decisión nueva.

**Suggested verification**

Toda versión de configuración muestra su autor y su fecha de creación en la pantalla de parámetros,
además de su vigencia.

**Required change type** → `DESIGN / ADR CHANGE`

---

#### [x] SEC-09 — La rotación obligatoria de la contraseña sembrada no tiene política de contraseña

| | |
|---|---|
| **Severity** | LOW |
| **Confidence** | HIGH |
| **Category** | Default inseguro / requisito de credencial ausente |
| **Affected artifact** | Specs — `TECH-DESIGN.md` *Arranque del sistema*, `adrs/0031` §Arranque |

**Description**

El arranque está bien resuelto: contraseña generada al sembrar, mostrada una sola vez, rotación
obligatoria en el primer ingreso. Pero **no hay ningún requisito sobre la contraseña nueva**: ni
longitud mínima, ni criterio de fuerza, ni prohibición de valores triviales.

Una implementación que acepte `1234` cumple los cuatro criterios de aceptación de arranque tal como
están escritos.

**Evidence**

- `TECH-DESIGN.md`, *Arranque del sistema*: *"su contraseña se genera al sembrar, se muestra una sola
  vez y debe rotarse en el primer ingreso"*. Es el único criterio sobre la contraseña del
  administrador además del KDF.
- ADR-0031 declara el peso de esa credencial: *"la contraseña del administrador es **el único secreto
  fuerte del sistema**, y no tiene segundo factor"*.

El ADR apuesta toda la seguridad de `/admin` a que esa contraseña sea fuerte, y el diseño no exige
que lo sea.

**Attack scenario**

El administrador rota a una contraseña corta por comodidad —es el mismo usuario que aceptó PINs de 4
dígitos como norma del sistema, así que el sesgo es real—. Con el límite de intentos por dispositivo
(y su bypass, SEC-03), la contraseña queda expuesta a fuerza bruta en línea.

**Potential impact**

Degradación del único secreto fuerte del sistema, sobre la superficie que gobierna la estructura de
costos, el calendario, los parámetros de dinero y la liquidación de propinas.

**Existing mitigation**

La rotación obligatoria evita el peor caso —la credencial sembrada quedando activa—, y el KDF de
memoria dura protege el volcado.

**Recommended remediation**

Un criterio de aceptación con una política mínima: longitud mínima (12 caracteres es un umbral
razonable y sin fricción para sesiones largas), rechazo de la contraseña sembrada como valor nuevo, y
contraste contra una lista de contraseñas comunes. ADR-0031 ya dejó el segundo factor declarado como
fuera de alcance con fundamento; no hace falta reabrirlo.

**Suggested verification**

Rotar a una contraseña de menos de la longitud mínima falla, con el motivo explicado. Rotar a la
misma contraseña sembrada falla.

**Required change type** → `SPEC CHANGE`

---

#### [x] SEC-10 — El token de dispositivo no tiene entropía, formato ni caducidad especificados

| | |
|---|---|
| **Severity** | LOW |
| **Confidence** | MEDIUM |
| **Category** | Manejo inseguro de token / credencial sin ciclo de vida |
| **Affected artifact** | Arquitectura — `adrs/0031`, `TECH-DESIGN.md` (`Dispositivo`) |
| **Location** | `adrs/0031` §Decisión, punto 1; `TECH-DESIGN.md` *Acceso*, criterio 1 |

**Description**

El token de dispositivo es la credencial de la primera capa de acceso, y de él dependen las cinco
pantallas. El diseño especifica su manejo pero no su forma:

- **Sin entropía ni formato declarados.** Nada impide que se implemente como un valor corto o
  derivado del nombre del dispositivo, adivinable por fuerza bruta.
- **Sin caducidad.** Es *"de larga duración"*, sin número. `Dispositivo` tiene `enrolado_en` y
  `revocado_en`, pero ningún campo de expiración.
- **Sin rotación.** No hay acción de rotar un token sin revocar y re-enrolar el equipo.
- **Sin límite de intentos.** El bloqueo de ADR-0031 alcanza *"solo al pedido de PIN o contraseña"*,
  explícitamente. Un token adivinable no tiene contador que lo frene.

**Evidence**

- `adrs/0031:57-60` — la definición completa de la capa de dispositivo: nombre, rol, `token_hash`,
  `enrolado_en`, `revocado_en`, cookie de larga duración. Ninguna propiedad del valor.
- `adrs/0031:82-83` — *"el bloqueo alcanza **solo al pedido de PIN o contraseña**"*.
- ADR-0031 acepta explícitamente el riesgo de robo del equipo, y hace depender la revocación de que
  alguien lo note: *"la revocación depende de que alguien note la pérdida"*.

**Attack scenario**

Depende de la implementación, y por eso la confianza es MEDIUM. Si el token resulta corto o
predecible, un atacante en la red local lo adivina sin ningún límite de intentos y obtiene lectura
permanente del stream (agravado por SEC-02, que define qué contiene ese stream). Si el token es un
valor aleatorio de 256 bits, el hallazgo se reduce a la ausencia de caducidad y rotación.

**Potential impact**

Acceso persistente y no detectado al canal de eventos. Sin caducidad, un token filtrado en cualquier
momento de la vida del sistema sigue sirviendo para siempre salvo revocación manual.

**Existing mitigation**

El token se muestra una sola vez y se persiste hasheado. Existe revocación desde `/admin`, con
criterio de aceptación propio (*"Revocar un dispositivo desde `/admin` corta su stream sin afectar a
los demás"*), lo cual ya es más de lo que tenía el diseño antes de ADR-0031.

**Recommended remediation**

1. **Especificar la entropía**: mínimo 128 bits de un generador criptográficamente seguro.
2. **Definir "larga duración" como un número** con renovación automática mientras el dispositivo esté
   activo, de modo que un equipo perdido y apagado caduque solo.
3. **Acción de rotar** el token sin re-enrolar, para la rotación periódica y para la sospecha sin
   certeza.
4. **Resolver el hash del token junto con SEC-04**: un token de alta entropía no necesita KDF, pero
   esa decisión hay que escribirla en vez de heredarla del *"igual que el PIN"*.

**Suggested verification**

Dos enrolamientos consecutivos producen tokens sin ninguna relación deducible. Un token vencido es
rechazado en la suscripción al stream aunque el dispositivo no esté revocado.

**Required change type** → `SPEC CHANGE`

---

## Prioridad

El orden no sigue la severidad: sigue las dependencias entre hallazgos.

| # | Hallazgo | Por qué va acá |
|---|---|---|
| 1 | **SEC-01** — TLS | Bloquea a los demás. Sin transporte cifrado, arreglar CSRF (SEC-05) o el hash de PINs (SEC-04) es blindar una puerta con la ventana abierta. Además `Secure` en las cookies **depende** de esta decisión. |
| 2 | **SEC-03** — Bypass del límite de intentos | Es el otro que se arregla en la misma sesión de trabajo, porque toca el mismo ADR. Y su segunda mitad —el arranque sin dispositivo— es un bloqueante funcional, no solo de seguridad: sin resolverlo, una base recién migrada no llega a enrolar la primera pantalla. |
| 3 | **SEC-05** — CSRF | Cierra con SEC-01 en la misma decisión de cookies. Los tres primeros son un solo ADR de despliegue y sesión. |
| 4 | **SEC-02** — Alcance del stream SSE | Es el más caro en diseño: obliga a separar eventos de catálogo de eventos de cuenta. Va después de los tres anteriores porque necesita pensarse, no decidirse. |
| 5 | **SEC-04** — KDF para PINs y token | Barato, aislado, y depende de SEC-10 solo en la parte del token. |
| 6 | **SEC-07** — Atribución de anulaciones | Decisión de producto. Va antes que SEC-06 porque su remediación exige un campo nuevo en el modelo, y cuanto antes entre, menos cuesta. |
| 7 | **SEC-10** — Ciclo de vida del token | Se resuelve junto con SEC-04. |
| 8 | **SEC-08** — Autor de las versiones de configuración | Dos campos, ninguna decisión. Puede entrar en cualquier momento. |
| 9 | **SEC-09** — Política de contraseña | Un criterio de aceptación. |
| 10 | **SEC-06** — Datos personales | Último por consecuencia práctica —el proyecto es académico y no se despliega—, pero es el que más cuesta postergar si algún día sale a producción, porque implica migrar datos ya recolectados. |

**Nota sobre el momento.** Los diez hallazgos son previos a la primera línea de código. Ocho de ellos
se cierran editando un ADR o agregando un criterio de aceptación. Ese es el argumento para hacer este
pase ahora y no después: los mismos diez, encontrados con el sistema implementado, serían refactors.

---

## Gobernanza / Decisión requerida

Los siguientes hallazgos **no se pueden resolver sin una decisión humana**. Este pase no tiene
autoridad para cambiar arquitectura, alcance de producto ni aceptar riesgo en nombre de nadie.

**Requieren decisión de arquitectura** (`DESIGN / ADR CHANGE`)

- **SEC-01 — Transporte cifrado.** Exige un ADR de despliegue que hoy no existe. La decisión de fondo
  es si el sistema asume TLS con CA interna, o si revierte la postura de ADR-0031 y acepta la red
  local como frontera de confianza declarándolo como supuesto. Las dos son defendibles para un local
  único; lo que no es defendible es la combinación actual, que rechazó la confianza en la red pero
  puso credenciales que dependen de ella.
- **SEC-02 — Alcance del canal SSE.** Decidir el filtrado por rol tiene un costo de diseño real:
  obliga a separar eventos de catálogo de eventos de cuenta, y roza la propiedad que ADR-0031 protegió
  deliberadamente (que el stream no dependa de la persona). Es una decisión, no una corrección.
- **SEC-03 — Arranque y anclaje del límite de intentos.** Exigir dispositivo para autenticar reabre la
  cadena de arranque que ADR-0031 ya resolvió una vez para `CredencialCocina`. La salida elegida
  —sembrar un dispositivo, o permitir un enrolamiento inicial con la contraseña sembrada— es una
  decisión de arquitectura con consecuencias sobre el escenario simulado del PRD.
- **SEC-08 — Autor de las versiones de configuración.** Toca el modelo de datos y el alcance de
  ADR-0022. Es la más liviana de las cuatro.

**Requieren decisión de producto** (`PRODUCT / REQUIREMENT CHANGE`)

- **SEC-06 — Datos personales de clientes.** Qué se recolecta, para qué, por cuánto tiempo y quién
  puede leerlo. Hoy el `PRD.md` no lo dice, y decidirlo es del producto, no del diseño. Incluye la
  opción legítima de declararlo fuera de alcance con fundamento, como ya se hizo con la emisión
  electrónica — pero declararlo, no omitirlo.
- **SEC-07 — Atribución de anulaciones.** El `PRD.md` eligió "control por atribución" al eliminar al
  cajero. Extender esa atribución a la anulación es coherente con esa decisión, pero agrega fricción
  al mesero (motivo obligatorio) y un eje a un reporte comprometido. Es del producto.

**Sin riesgos aceptados en este pase.** Ningún hallazgo se cerró como `ACCEPT RISK`: la decisión de
aceptar un riesgo es del autor del proyecto, no de esta revisión.

**Ya aceptados por el proyecto, y correctamente declarados** — se listan para que no se relean como
hallazgos nuevos: el PIN prestado, el PIN de cocina compartido sin atribución, la ausencia de segundo
factor en `/admin`, el bloqueo por dispositivo usable como molestia, y la dependencia de la disciplina
de carga. Los cinco están declarados con su motivo en el `PRD.md` y en ADR-0031/0018, y este pase no
tiene nada que agregarles.

---

## Relación con `REVISION-ADVERSARIAL.md`

Este pase **no repite** los hallazgos de la revisión adversarial previa. Dos puntos de contacto:

- El hallazgo **#16** de esa revisión ("No existe ninguna decisión de despliegue", abierto) es la
  causa raíz de **SEC-01**. Este reporte no lo redescubre: le da la consecuencia de seguridad concreta
  y la vuelve un argumento adicional para cerrarlo.
- El hallazgo **#5** ("La ventana de servicio no tiene control de concurrencia", abierto) tiene una
  arista de integridad —una comanda persistida después del cierre—, pero su análisis ya está hecho
  ahí y es de corrección, no de seguridad. No se duplica.

Los hallazgos **#10** y **#11** de esa revisión, que sí eran de seguridad, fueron cerrados por
ADR-0031 y este pase lo confirma: las cinco superficies tienen política de acceso. Lo que este pase
agrega es que la política decide con precisión quién entra, y todavía no dice qué se protege una vez
adentro.
