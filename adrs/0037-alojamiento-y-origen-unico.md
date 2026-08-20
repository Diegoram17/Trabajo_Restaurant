# ADR 0037: El sistema corre alojado y con un solo origen

## Estado

Aceptado — cierra el hallazgo **#16** de `REVISION-ADVERSARIAL.md`, *"no existe ninguna decisión de
despliegue, y dos ADRs dependen de ella"*, que ADR-0033 había cerrado solo en su mitad de seguridad.

**Reemplaza la sección 1 de ADR-0033** —*TLS con CA interna*—. El resto de ADR-0033 sigue vigente y sin
cambios: los atributos de las dos cookies y la validación de `Origin` no solo se mantienen, funcionan
mejor bajo esta decisión que bajo la anterior.

Da piso a **ADR-0008**, que declaraba HTTP/2 como requisito de producción sobre un entorno que nadie
había definido, y precisa el costo que **ADR-0015** ya declaraba sobre la dependencia de red.

## Contexto

Ninguno de los treinta y seis ADRs anteriores decide **dónde corre el sistema**. El hallazgo #16 lo
señaló y nombró a los dos que apoyan sus garantías en ese entorno indefinido: ADR-0008, que convierte
HTTP/2 en requisito de producción, y ADR-0015, que hace de la red una dependencia dura de la operación.

Pero la decisión ya estaba tomada, sin estar escrita. ADR-0033 eligió **una CA propia del local**, con
su certificado raíz instalado en las cinco pantallas durante el enrolamiento. Ese mecanismo solo tiene
sentido si el servidor vive en la red del local, sin nombre público y sin forma de que una autoridad
externa lo valide. Al elegir el mecanismo, ADR-0033 eligió el entorno — y no lo dijo en ninguna parte.
Es el modo de falla que este proyecto ya tiene diagnosticado dos veces: no decidir mal, sino no
propagar lo decidido.

Esa CA de hecho traía tres costos que el propio ADR-0033 declaró con honestidad y **no resolvió**:

1. *"La clave privada de la CA es un secreto nuevo, y es el más fuerte del sistema... No vive en la base
   de datos ni tiene rotación definida acá."* Dice dónde no vive; no dice dónde sí.
2. *"Un certificado vencido deja el local sin sistema... no hay revocación selectiva que lo salve: caen
   las cinco pantallas a la vez... no existe ninguna alarma en el sistema que la anticipe."*
3. *"El enrolamiento se vuelve más pesado y menos reversible."*

Y hay una cuarta tensión, que el mismo ADR-0033 nombra: es **infraestructura de producción en un
proyecto que declara no tener producción**. El `PRD.md` es explícito: *"Trabajo académico. No hay
despliegue en un local real ni día de piloto"*, y todo criterio se valida sobre un set de datos
simulado. Lo que el proyecto necesita no es una instalación en un restaurante: es un entorno donde el
sistema corra y se pueda demostrar.

## Decisión

**El sistema corre alojado en una plataforma administrada, servido desde un único origen.**

### 1 — Dónde corre

| Pieza | Dónde | Qué implica |
|---|---|---|
| Backend Node + tRPC | Render | También sirve los estáticos de la SPA |
| SPA React (4 rutas) | El mismo servicio de Render | No tiene origen propio |
| PostgreSQL | Neon | Base administrada, sigue siendo PostgreSQL |

### 2 — Un solo origen, y por qué es parte de la decisión

El backend sirve la SPA. Las cuatro rutas —`/estacion`, `/kds`, `/cocina`, `/admin`— y la API tRPC
comparten origen. **No hay un front alojado aparte.**

No es una preferencia de despliegue: es lo que mantiene vivas las decisiones de ADR-0033. Con el front
en un sitio distinto del backend, la cookie de `/admin` con `SameSite=Strict` no viaja nunca, y la de
dispositivo con `SameSite=Lax` no viaja en los POST de las mutaciones tRPC. La única forma de que
funcionen sería `SameSite=None`, que reabre exactamente el CSRF que ADR-0033 cerró — y ADR-0022 hace
que ese daño sea permanente, porque una vigencia falsificada no se puede deshacer. Un solo origen deja
las tres defensas de ADR-0033 funcionando tal como están escritas.

### 3 — El certificado ya no es del local

La plataforma termina el TLS con un certificado público sobre su propio dominio. **No se genera ninguna
CA, no se custodia ninguna clave privada y no se instala ningún certificado raíz en las pantallas.** El
paso que ADR-0033 agregaba al enrolamiento desaparece: enrolar un dispositivo vuelve a ser recibir el
token, y nada más.

HTTP/2 lo provee el borde de la plataforma, con lo que ADR-0008 queda satisfecho sin trabajo propio.

### 4 — Cómo se lee "el backend no escucha en claro"

ADR-0033 exige que *"el backend no escuche en claro"* y que una petición HTTP **se rechace y no se
redirija**. Bajo esta decisión eso se lee **sobre la interfaz pública**: el sistema no expone ningún
puerto en claro a ninguna red, y el borde de la plataforma no atiende HTTP sin cifrar. El proceso Node
recibe tráfico ya descifrado desde ese borde, dentro del perímetro de la plataforma.

Se escribe acá de forma explícita porque, sin esta lectura, ADR-0033 y esta decisión se contradicen en
la letra.

## Alternativas consideradas

- **Servidor en el local con CA propia** — el escenario que ADR-0033 asumió sin escribirlo, y el que el
  `PRD.md` describe como operación real. Viable y coherente con el producto. No se eligió porque el
  proyecto es académico y no tiene local donde instalarlo, y porque los tres costos que ADR-0033 declaró
  sin resolver —custodia de la clave, renovación sin alarma, enrolamiento más pesado— son infraestructura
  de producción real para un entregable que se evalúa sobre datos simulados. El día que exista un
  despliegue real, esta alternativa y la sección 1 de ADR-0033 vuelven a estar sobre la mesa.

- **Front alojado aparte del backend** — el reparto habitual, y perfectamente viable en general. No se
  eligió porque acá cuesta caro y no compra nada: son dos sitios distintos, las cookies de ADR-0033 dejan
  de viajar, y recuperarlas exige `SameSite=None` más un rediseño de la defensa CSRF —token por
  formulario, que ADR-0033 evaluó y descartó por las piezas que agrega—. El front son cuatro rutas de una
  SPA que ya se compila a estáticos: servirlos desde el mismo proceso no tiene costo apreciable.

- **Alojar en la nube y mantener igual la CA propia** — queda sin objeto. La plataforma ya emite un
  certificado público válido para su dominio; una CA propia encima solo agregaría el secreto y la
  renovación que esta decisión viene a eliminar.

## Consecuencias

- **Desaparece el secreto más fuerte del sistema.** No hay clave privada de CA que custodiar, ni
  respaldo que mantener, ni rotación que definir. ADR-0031 vuelve a ser cierto cuando dice que *"la
  contraseña del administrador es el único secreto fuerte del sistema"*.

- **Desaparece la falla total sin alarma.** Ya no existe un certificado propio cuyo vencimiento baje las
  cinco pantallas a la vez sin que nada lo anticipe.

- **El enrolamiento vuelve a ser un solo paso.** Sin certificado raíz que instalar, la puesta en marcha
  de una pantalla es la de ADR-0031, y una pantalla que se reinstala no vuelve a exigir al administrador
  más de lo que ya exigía.

- **Las defensas de sesión de ADR-0033 quedan intactas y sin excepciones.** Un solo origen es la
  condición bajo la cual `SameSite=Lax`, `SameSite=Strict` y la validación de `Origin` hacen exactamente
  lo que dicen.

- **Costo: la dependencia de red de ADR-0015 escala de local a externa.** Ese ADR declaraba que *"un
  corte de red deja la estación inutilizable para tomar pedidos"*, y el corte era del wifi del local.
  Ahora es del proveedor de internet: si se cae el enlace, el restaurante no toma un pedido más, y a
  diferencia de un problema de wifi no se resuelve desde adentro del local.

- **Costo: el arranque en frío es real y le pega primero al canal que menos lo tolera.** Neon con
  escalado a cero y las instancias que se duermen por inactividad hacen lenta la primera petición
  después de un rato sin uso. El stream SSE del KDS, que por diseño se mantiene abierto (ADR-0008,
  ADR-0009), es lo primero que lo sufre. Aceptable para demostrar; para operación real exige instancias
  que no duerman.

- **Costo: el sistema deja de ser autónomo dentro del local.** Cualquier incidente de la plataforma o
  del proveedor es un incidente del restaurante, sin recurso local y sin plan de contingencia definido
  acá.

- **Costo: lo que se implementa se aleja de lo que el PRD describe como operación.** El `PRD.md` dibuja
  un local con su propia red; esto corre afuera. La distancia es aceptable para un trabajo académico y
  queda declarada, no disimulada.
