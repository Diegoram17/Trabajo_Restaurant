# ADR 0033: TLS con CA propia del local, y los atributos que la sesión necesitaba

## Estado

Aceptado — cierra los hallazgos **SEC-01** y **SEC-05** de `SECURITY-REPORT.md`, que estaban acoplados:
el atributo `Secure` de una cookie no existe sin transporte cifrado, así que la defensa de sesión no se
podía decidir antes que el transporte. Completa **ADR-0031**, que eligió cookies como credencial de las
tres capas y no decidió por dónde viajan. Cierra además la mitad de seguridad del hallazgo **#16** de
`REVISION-ADVERSARIAL.md` —*"no existe ninguna decisión de despliegue"*—, que sigue abierto en lo que
respecta a empaquetado y entrega.

## Contexto

ADR-0031 tomó una decisión explícita sobre en qué **no** confiar, y la argumentó:

> *"**La red local como frontera de confianza**, dejando el SSE sin autorización y declarándolo como
> supuesto. Viable, gratis y defendible para un local único que no se expone a internet. No se eligió
> porque el stream transporta comandas, mesas, meseros y cambios de disponibilidad, y porque `/admin`
> —que gobierna el calendario que divide todo el estado de resultados— vive en esa misma red."*

Y en lugar de esa confianza puso credenciales concretas: una cookie de dispositivo de larga duración y
una cookie de sesión de administrador de 60 minutos, las dos `httpOnly`.

El problema es que esas credenciales viajan **por la misma red en la que se decidió no confiar**, y el
proyecto nunca decidió cómo. Ni el `PRD.md`, ni el `TECH-DESIGN.md`, ni ninguno de los 32 ADRs anteriores
mencionan TLS, HTTPS ni cifrado en tránsito. La única aparición de la palabra *certificado* en todo el
proyecto es sobre firma digital de comprobantes electrónicos, que está fuera de alcance y es otro tema.

Sin cifrado, la decisión queda invertida contra su propia intención. `httpOnly` protege contra lectura
por JavaScript, no contra lectura por la red: cualquiera con una posición en el wifi del local —que el
`PRD.md` ya declara como dependencia no controlada: *"la calidad del wifi del local es un requisito no
funcional que el producto no controla"*— lee la cookie de dispositivo en el primer request que pase, el
PIN de 4 dígitos en el POST del login, y la cookie de `/admin` durante toda su ventana de inactividad.
Las tres capas de ADR-0031 se saltean desde una sola posición.

Al modelarlo aparecen dos cosas que ordenan la decisión.

**La primera: los cinco dispositivos ya están administrados.** ADR-0031 creó una entidad `Dispositivo`
que se enrola una vez desde `/admin`, con un token que se muestra una sola vez y se puede revocar. El
equipo ya pasa por un procedimiento de puesta en marcha atendido por el administrador. Instalar un
certificado raíz en ese mismo momento no agrega un procedimiento: agrega un paso a uno que ya existe.

**La segunda: `SameSite` no es una decisión aparte.** El proyecto no menciona CSRF, `SameSite` ni
validación de `Origin` en ninguna parte. Y la combinación que tiene —cookies de sesión más mutaciones
tRPC por POST (ADR-0010)— es exactamente la que habilita la falsificación de petición entre sitios. El
agravante es propio de este sistema: ADR-0022 prohíbe corregir hacia atrás, así que una escritura no
autorizada sobre `ConfiguracionCostos` o `CalendarioApertura` **no se puede deshacer**. Solo se puede
crear una vigencia nueva hacia adelante. El daño de una petición falsificada es permanente por decisión
de arquitectura.

## Decisión

**Todo el tráfico del sistema va cifrado, con una CA propia del local, y las cookies llevan los tres
atributos que eso habilita.**

### 1 — TLS con CA interna

Se genera una autoridad certificadora propia del local. El backend sirve un certificado emitido por ella,
y el certificado raíz se instala en las **5 pantallas** —3 estaciones, KDS de pared y estación de cocina—
como parte del mismo procedimiento de enrolamiento que ya define ADR-0031.

```
Enrolar un dispositivo (ADR-0031)   →  instalar el certificado raíz  (nuevo)
                                    →  recibir el token, mostrado una vez
```

Los dos pasos son del mismo momento y del mismo actor. No hay un procedimiento nuevo que explicar, hay un
paso más en uno que ya existía.

**El tráfico en claro se rechaza, no se redirige.** Una redirección de HTTP a HTTPS deja la primera
petición viajando en claro —con su cookie adentro—, que es exactamente lo que esta decisión viene a
evitar. El backend no escucha en claro.

### 2 — Los atributos de las dos cookies

```
Cookie de dispositivo   Secure · HttpOnly · SameSite=Lax
Cookie de /admin        Secure · HttpOnly · SameSite=Strict
```

`SameSite` difiere porque las dos cookies tienen usos distintos. La de `/admin` es `Strict` porque no
existe ninguna navegación entrante legítima desde otro sitio hacia el panel: nada se rompe. La de
dispositivo es `Lax` porque tiene que sobrevivir a una navegación normal hacia la ruta de la pantalla,
que es cómo arranca cada equipo al encenderse.

### 3 — Validación de `Origin` en toda mutación

Toda mutación tRPC valida la cabecera `Origin` contra el origen del sistema y rechaza lo que no coincida.
Es red de seguridad y no control principal: `SameSite` ya cubre el caso, pero depende del comportamiento
por defecto del navegador, y esa es una garantía que el sistema no controla ni versiona.

## Alternativas consideradas

- **Aceptar la red local como frontera de confianza**, declarándolo como supuesto en el `PRD.md` junto a
  los otros trece riesgos abiertos. Gratis, honesto y perfectamente defendible para un local único que no
  se expone a internet, y para un trabajo académico que no se despliega. No se eligió porque **obligaría
  a reescribir el razonamiento de ADR-0031**, que descartó esa misma confianza para elegir cookies. Un
  proyecto puede confiar en su red o no confiar, pero no puede rechazar la confianza en un ADR y
  apoyarse en ella en el siguiente. Y el costo de no hacerlo es una CA en un local que ya administra
  cinco equipos de a uno.

- **Certificado autofirmado sin CA**, aceptando la excepción en cada navegador. Cifra el tráfico igual y
  habilita `Secure` con menos infraestructura. No se eligió por una razón que no es técnica: entrena al
  personal a saltear advertencias de certificado. Una vez que la advertencia es rutina, un
  man-in-the-middle en la red produce exactamente la misma pantalla que el operador ya aprendió a
  ignorar, y el control se vuelve decorativo. Es peor que la alternativa anterior, porque *parece* un
  control.

- **`SameSite=Strict` también en la cookie de dispositivo**, por consistencia. No se eligió porque
  rompería el arranque normal de una pantalla: cada equipo abre su ruta por navegación, y con `Strict`
  la cookie no viaja en esa primera petición. La consistencia sería con la forma y no con el motivo —el
  mismo criterio con el que ADR-0031 rechazó heredar el PIN corto para `/admin`.

- **Token anti-CSRF por formulario**, el control clásico, en lugar de `SameSite` más `Origin`. Viable y
  estrictamente más fuerte. No se eligió porque exige estado por sesión y un punto de emisión en cada
  superficie, y porque las dos defensas elegidas cubren el vector real de este sistema —un panel de
  administración en una red local— sin agregar piezas. Si alguna vez el sistema se expusiera fuera de la
  red del local, es lo primero a revisar junto con el segundo factor que ADR-0031 dejó fuera de alcance.

## Consecuencias

- **La postura de ADR-0031 pasa de declaración a mecanismo.** *"No confiamos en la red local"* deja de
  ser una frase en una lista de alternativas descartadas y pasa a ser una propiedad del transporte. Es el
  mismo movimiento que ADR-0031 hizo con el principio de ADR-0016.

- **Las tres capas dejan de ser interceptables desde una sola posición de red.** El token de dispositivo,
  el PIN del mesero, el PIN de cocina y la contraseña del administrador viajan cifrados, y la cookie con
  `Secure` no puede salir por un canal en claro ni por accidente de configuración.

- **La corrección imposible hacia atrás de ADR-0022 deja de ser una superficie de ataque.** Era el
  agravante real del CSRF: una vigencia escrita por una petición falsificada no se puede deshacer. Con
  `SameSite` y validación de `Origin`, esa escritura no ocurre.

- **Costo: una pieza de infraestructura que el proyecto no tenía.** Hay que generar la CA, custodiar su
  clave privada, emitir el certificado del backend y renovarlo antes de que venza. Un certificado vencido
  **deja el local sin sistema**, y a diferencia de un token de dispositivo no hay revocación selectiva
  que lo salve: caen las cinco pantallas a la vez. La renovación es ahora una tarea operativa con
  consecuencia total, y no existe ninguna alarma en el sistema que la anticipe.

- **Costo: la clave privada de la CA es un secreto nuevo, y es el más fuerte del sistema.** ADR-0031
  declaró que *"la contraseña del administrador es el único secreto fuerte del sistema"*. Ya no lo es:
  quien tenga la clave de la CA puede emitir un certificado válido para cualquier nombre y ponerse en el
  medio sin que ninguna pantalla proteste. No vive en la base de datos ni tiene rotación definida acá.

- **Costo: el enrolamiento se vuelve más pesado y menos reversible.** Una pantalla que se reinstala pierde
  el certificado raíz junto con la cookie, así que la puesta en marcha vuelve a exigir al administrador.
  Y un equipo que no admita instalar una CA propia —un navegador con almacén de certificados cerrado—
  queda fuera del sistema por completo, no degradado.

- **Costo: es infraestructura de producción en un proyecto que declara no tener producción.** El `PRD.md`
  establece que es un trabajo académico validado con datos simulados. En ese contexto la CA es trabajo
  que no rinde beneficio observable, y se acepta por coherencia con ADR-0031, no por necesidad
  operativa demostrable.

- **No cierra el hallazgo #16 completo.** Sigue sin haber decisión de empaquetado, entrega ni versionado
  del despliegue, y ADR-0008 sigue dependiendo de HTTP/2 como requisito de producción. Esta decisión
  resuelve el transporte y la sesión, no el despliegue.
