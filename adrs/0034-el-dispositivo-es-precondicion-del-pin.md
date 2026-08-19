# ADR 0034: El dispositivo es precondición del PIN, no de la contraseña

## Estado

Aceptado — cierra el hallazgo **SEC-03** de `SECURITY-REPORT.md`. Completa **ADR-0031**, que ancló el
límite de intentos al dispositivo y no dijo si autenticarse exige uno. Sigue la propia lógica de ese ADR
hasta su conclusión: el ancla del contador depende de si la credencial identifica a alguien, y ADR-0031
ya había escrito por qué.

## Contexto

ADR-0031 definió el límite de intentos con cuidado y dio la razón de su alcance:

> ```
> 5 intentos fallidos → el DISPOSITIVO queda bloqueado 60 s
> cada bloqueo siguiente duplica la espera, con tope en 15 min
> el contador se reinicia con un acierto
> ```
>
> *"Es **por dispositivo, no por cuenta**, por una razón concreta: el PIN del mesero **no identifica a
> nadie hasta que acierta**, así que no hay cuenta contra la cual contar."*

El razonamiento es correcto y la decisión también. Lo que quedó sin escribir es la dependencia que
introduce: **si el contador vive en el dispositivo, un intento sin dispositivo no tiene contador.**

Y el diseño nunca dijo que autenticarse requiera un dispositivo enrolado. Dijo lo contrario sobre la
dirección opuesta —*"Autoriza leer el stream y presentarse como esa ruta. **No autoriza ninguna
acción**"*— pero nunca cerró esta. El criterio de aceptación *"Una suscripción al stream sin dispositivo
enrolado se rechaza"* existe **solo para el stream**; no hay ninguno simétrico para la verificación de
credenciales. Con tRPC (ADR-0010) los procedimientos son endpoints alcanzables por cualquier cliente de
la red, no solo por la SPA, así que la omisión no es teórica.

Deja el sistema entre dos implementaciones y las dos son malas:

- **Sin dispositivo no hay contra qué contar, y el intento pasa sin límite.** El espacio del PIN de
  mesero es de 10⁴ y cualquier acierto sirve, porque el PIN no identifica hasta que acierta: con 8
  meseros activos la probabilidad por intento es ≈ 1/1250. Son segundos de trabajo para una sesión de
  mesero legítima que puede cobrar, registrar propinas y cerrar turno.
- **Sin dispositivo no se puede autenticar nunca.** Correcto en seguridad, y rompe el arranque: el
  administrador tiene que entrar a `/admin` para **enrolar el primer dispositivo**, y no puede hacerlo
  desde un dispositivo que todavía no existe. Es la misma cadena circular que ADR-0031 ya resolvió una
  vez para `CredencialCocina`, reapareciendo un nivel más abajo.

Al modelarlo aparece que la disyuntiva es falsa, y que ADR-0031 ya tenía la respuesta escrita sin
haberla aplicado.

**La razón del ancla por dispositivo no es general: es una propiedad del PIN.** ADR-0031 lo dice con
todas las letras —*"el PIN del mesero no identifica a nadie hasta que acierta, así que **no hay cuenta**
contra la cual contar"*—. Esa condición **no se cumple para `/admin`**, que entra con usuario y
contraseña. El usuario identifica la cuenta antes de verificar nada, así que sí hay cuenta contra la cual
contar, y el ancla por dispositivo nunca fue necesaria ahí.

**Y el modelo de datos ya lo decía.** `Dispositivo` tiene rol `estacion | kds | cocina`. **No existe el
rol `admin`.** Las pantallas que se enrolan son cinco —3 estaciones, KDS de pared y estación de
cocina— y `/admin` nunca estuvo entre ellas. Exigirle un dispositivo al administrador no sería
completar ADR-0031: sería contradecir su modelo.

## Decisión

**El ancla del límite de intentos la fija la naturaleza de la credencial, y de ahí sale qué exige
dispositivo.**

```
CREDENCIAL              ¿IDENTIFICA?   ANCLA DEL CONTADOR      ¿EXIGE DISPOSITIVO?

PIN de mesero           No             dispositivo             Sí
PIN de cocina           No             dispositivo             Sí
Usuario y contraseña    Sí             cuenta + IP de origen   No
```

**1 — Verificar un PIN exige cookie de dispositivo válida.** Sin ella, la llamada se rechaza **antes de
comparar el PIN**, y el rechazo es indistinguible del PIN inválido — la misma regla de no revelación que
ADR-0031 ya exige. Cubre el PIN del mesero y el PIN de cocina, que son las dos credenciales que no
identifican a nadie.

**2 — `/admin` no exige dispositivo, y su contador va por cuenta y por IP de origen.** Misma escalera
—5 intentos, 60 s, duplicación con tope en 15 min, reinicio con acierto—, distinto ancla. El contador por
cuenta protege la credencial; el contador por IP evita que enumerar usuarios sea gratis.

**3 — Contador de respaldo por IP para todo intento sin dispositivo.** Ninguna implementación puede
quedar sin límite alguno, aunque el camino sea el rechazado del punto 1.

### Con esto el arranque se abre solo

```
base vacía
  → administrador sembrado entra a /admin        (no exige dispositivo)
  → rota su contraseña                            (obligatorio, ADR-0031)
  → enrola las 5 pantallas                        (token + certificado raíz, ADR-0033)
  → define la CredencialCocina                    (ADR-0031)
  → el salón puede vender comida
```

No hace falta sembrar ningún dispositivo, ni inventar un modo de primer arranque, ni una excepción
temporal que después alguien tiene que acordarse de cerrar. La cadena nunca estuvo cerrada: se veía
cerrada porque se le atribuyó a `/admin` un requisito que su modelo nunca tuvo.

## Alternativas consideradas

- **Sembrar un dispositivo de arranque** en la migración inicial, junto al administrador. Viable y
  resuelve la cadena. No se eligió porque contradice la decisión de arranque de ADR-0031 —*"La migración
  inicial crea **un administrador y nada más**"*— y porque agrega un segundo secreto sembrado. El de la
  contraseña tiene rotación obligatoria en el primer ingreso; un token sembrado no tendría ninguna, y
  sobreviviría años en una base que nadie volvió a mirar. Cambiar un agujero de arranque por una
  credencial permanente no es una mejora.

- **Modo de primer arranque**, que permita entrar a `/admin` sin dispositivo mientras haya cero
  dispositivos enrolados y se cierre solo para siempre al enrolar el primero. Viable y de alcance
  acotado por construcción. No se eligió porque es un estado más del sistema que hay que representar,
  probar y explicar, para resolver un problema que —una vez visto el modelo de `Dispositivo`— no existe.
  Y un modo que se cierra solo es un modo que alguien va a querer reabrir cuando pierda todos los
  equipos, que es justo cuando no debería poder.

- **Exigir dispositivo también para `/admin`, enrolando la máquina del administrador** como un cuarto
  rol. Viable y consistente en la forma. No se eligió por dos motivos: obliga a resolver el arranque con
  alguna de las dos alternativas anteriores, y el `DESIGN.md` describe al administrador como alguien que
  *"trabaja solo y por sesiones largas"* — no en una pantalla fija del local, sino donde esté. Atarlo a
  un equipo enrolado le agrega una restricción física que su rol no tiene, que es el mismo error que
  ADR-0031 evitó al no darle un PIN corto.

- **Contador global por IP para todas las credenciales**, sin ancla por dispositivo. Viable y más simple.
  No se eligió porque pierde la propiedad que ADR-0031 buscó explícitamente: *"una estación bajo ataque
  **no arrastra a las otras dos**"*. Con las tres estaciones detrás del mismo NAT del local, un contador
  por IP las bloquearía juntas.

## Consecuencias

- **El agujero se cierra sin agregar ninguna entidad, ningún estado y ningún secreto.** La decisión es
  una regla de dos líneas sobre credenciales que ya existen. El arranque queda abierto porque nunca
  estuvo cerrado.

- **La fuerza bruta contra el PIN vuelve a estar acotada por el control que ADR-0031 diseñó.** No hay
  camino que evite el contador: sin dispositivo no se compara el PIN, y el intento igual cuenta contra el
  contador de respaldo por IP.

- **`/admin` gana un control que no tenía.** Su contador por cuenta es nuevo — ADR-0031 solo describió el
  bloqueo por dispositivo, que no le aplicaba. Hasta ahora la contraseña del administrador no tenía
  ningún límite de intentos escrito.

- **Costo: dos anclas de contador en lugar de una.** El sistema tiene ahora tres contadores —dispositivo,
  cuenta e IP— con la misma escalera y distinto sujeto. Es más superficie para equivocarse al
  implementar, y la equivocación es silenciosa: un contador mal anclado no falla, simplemente no protege.
  La verificación tiene que probar los tres por separado.

- **Costo: el contador por IP es tosco detrás de un NAT.** Todos los intentos del local salen de la misma
  IP, así que el contador de respaldo puede bloquear a un tercero legítimo. Se acepta porque es de
  respaldo: el camino normal —PIN desde una estación enrolada, contraseña desde el equipo del
  administrador— usa las otras dos anclas, y el de respaldo solo alcanza a peticiones que ya están fuera
  del camino previsto.

- **Costo: `/admin` sigue siendo la superficie con menos capas.** Una sola credencial, sin dispositivo y
  sin segundo factor —que ADR-0031 dejó declarado fuera de alcance—, gobernando la estructura de costos,
  el calendario que divide todo el estado de resultados, los parámetros de dinero y la liquidación de
  propinas. Esta decisión lo deja explícito en vez de implícito, pero no lo cambia.

- **Este ADR no toca el alcance del stream.** Que `/admin` no sea un dispositivo enrolado significa que
  tampoco es un suscriptor del canal SSE, lo cual es consistente con ADR-0031 y con el modelo. El
  hallazgo SEC-02 —qué recibe cada dispositivo una vez admitido— sigue abierto y es una decisión aparte.
