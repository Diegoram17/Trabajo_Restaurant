# ADR 0036: El hash de cada secreto lo decide su entropía, y el token de dispositivo tiene la suya

## Estado

Aceptado — cierra los hallazgos **SEC-04** y **SEC-10** de `SECURITY-REPORT.md`, que estaban acoplados:
no se puede elegir cómo hashear el token de dispositivo sin saber cuánta entropía tiene, y su entropía
nunca se había especificado. Completa **ADR-0031**, que escribió el requisito criptográfico para uno de
los cuatro secretos del sistema.

## Contexto

ADR-0031 fue preciso donde decidió, y mudo en el resto. Escribió el requisito de algoritmo **solo para la
contraseña del administrador**:

> *"hasheada con un **KDF de memoria dura** —Argon2id o bcrypt, **nunca un hash rápido**—"*

Para los otros tres secretos el diseño dice "hash" y nada más:

| Secreto | Espacio | Algoritmo escrito |
|---|---|---|
| Contraseña de `/admin` | Alto | **Argon2id o bcrypt** |
| `Persona.pin_hash` | 10⁴ | — |
| `CredencialCocina.pin_hash` | 10⁶ | — |
| `Dispositivo.token_hash` | **sin especificar** | — |

El del token es el caso peor, porque su única definición es por analogía: ADR-0031 dice que *"se persiste
hasheado, **igual que el PIN**"*. La referencia apunta a un requisito que tampoco existe, así que la frase
hereda un vacío en lugar de llenarlo.

Con un hash rápido y sin sal, un volcado de la base —un respaldo, un `pgdata/` copiado, el acceso de quien
administre el servidor— entrega **los 10 000 PINs posibles precomputados en milisegundos**. No cae un PIN:
caen todos los activos a la vez. Y a diferencia de una contraseña filtrada, un PIN recuperado así no deja
rastro: la sesión resultante es indistinguible de la legítima, que es justo la propiedad sobre la que el
`PRD.md` apoya la atribución de ventas, comisiones y efectivo tras eliminar al cajero.

Al modelarlo aparece que **"KDF en todo" es la respuesta equivocada**, y por un motivo del propio sistema.

El token de dispositivo **se verifica en cada request del canal SSE**, con 5 pantallas suscritas todo el
servicio. Un KDF de memoria dura está diseñado para costar; ponerlo en el camino más caliente del sistema
es construirse una denegación de servicio contra uno mismo. Y no hace falta: un KDF existe para compensar
la **poca entropía** del secreto, y un token aleatorio no tiene ese problema.

De ahí sale la regla, y de ahí sale por qué los dos hallazgos son uno solo: **la entropía del token es la
premisa que hace válida su elección de hash.** Sin especificarla, elegir el hash rápido sería una apuesta.

## Decisión

**El algoritmo lo decide la entropía del secreto, no su rol en el sistema.**

```
BAJA ENTROPÍA  (lo elige un humano, o cabe en un diccionario)
  → KDF de memoria dura: Argon2id, con sal única por credencial
  → PIN de mesero · PIN de cocina · contraseña de /admin

ALTA ENTROPÍA  (lo genera un CSPRNG, ≥ 128 bits)
  → SHA-256 con sal única por credencial
  → token de dispositivo
```

**Sal única por credencial, siempre.** Sin ella, dos secretos iguales producen el mismo hash, y el
volcado se vuelve un ejercicio de agrupar en vez de uno de romper.

### El token de dispositivo, definido

```
Dispositivo
  token_hash     SHA-256 con sal
  enrolado_en
  expira_en      ← nuevo
  revocado_en

Valor:      ≥ 128 bits de un CSPRNG
Vigencia:   90 días, renovados solos mientras el dispositivo se use
Rotación:   acción propia en /admin, sin re-enrolar el equipo
```

La **renovación automática** es lo que hace que la caducidad no moleste: una pantalla que se usa todos los
días nunca vence, y **un equipo perdido y apagado caduca solo** a los 90 días. Cierra por tiempo lo que
ADR-0031 dejó dependiendo de que alguien note la pérdida.

La **rotación sin re-enrolar** existe para la sospecha sin certeza, que es el caso real: nadie perdió nada
pero el equipo estuvo fuera de la vista un rato. Sin ella la única salida es revocar y rehacer el
enrolamiento completo —token más certificado raíz (ADR-0033)—, que es tanto trabajo que en la práctica no
se hace.

### Sobre el PIN, con honestidad

Un KDF **no hace seguro un PIN de 4 dígitos** contra un volcado. Un espacio de 10⁴ es forzable offline
igual, con la base en la mano. Lo que el KDF rompe es la **precomputación masiva**: obliga a atacar cada
credencial por separado y sube el costo de milisegundos a horas.

El problema de fondo es estructural del PIN corto, y **ADR-0014 ya lo aceptó con razones físicas válidas**
—el mesero está de pie, apurado, frente a una pantalla a la vista del salón—. Esta decisión no lo reabre.
Cierra un multiplicador, no el problema.

## Alternativas consideradas

- **KDF de memoria dura para los cuatro secretos**, por uniformidad. Viable y la respuesta por defecto de
  cualquier guía. No se eligió por el camino caliente: el token se verifica en cada request del stream con
  5 pantallas conectadas todo el servicio, y un Argon2id ahí convierte el canal de tiempo real en el
  cuello de botella del sistema. La uniformidad sería con la **forma** y no con el **motivo** —el mismo
  criterio con el que ADR-0031 rechazó heredarle el PIN corto a `/admin`.

- **Sesión de dispositivo en memoria tras la primera verificación**, para pagar el KDF una sola vez y
  resolver el camino caliente sin renunciar a la uniformidad. Viable. No se eligió porque reintroduce
  estado de sesión del lado del servidor para las cinco pantallas, incluida `/kds`, que ADR-0016 y
  ADR-0031 dejaron deliberadamente **sin nada que se pueda perder**. Es un rediseño de la capa de
  dispositivo para ahorrar una decisión de dos líneas.

- **Token sin caducidad, confiando solo en la revocación**, que es lo que ADR-0031 tenía. Viable y con
  cero fricción operativa. No se eligió porque hace depender toda la ventana de exposición de que alguien
  **note** una pérdida, y un equipo robado de una cocina se nota tarde o no se nota. La renovación
  automática da la caducidad sin cobrar la fricción.

- **Caducidad más corta, de 7 o 30 días.** Viable y más segura. No se eligió porque una pantalla que
  estuvo apagada por vacaciones, refacción o temporada baja volvería muerta y exigiría al administrador
  justo el día que reabre el local. 90 días cubre un cierre estacional sin dejar un token vivo por años.

## Consecuencias

- **Los cuatro secretos tienen requisito, y el requisito tiene motivo.** Deja de haber uno decidido y tres
  heredando una analogía vacía. Un secreto nuevo que aparezca más adelante se clasifica solo: se pregunta
  de dónde sale su entropía.

- **El volcado de la base deja de entregar todos los PINs juntos.** La precomputación se rompe y el ataque
  pasa a ser por credencial. Es una mejora de escala, no de categoría, y el ADR lo dice en vez de
  disimularlo.

- **El equipo perdido y apagado caduca solo.** ADR-0031 declaró que *"la revocación depende de que alguien
  note la pérdida"*. Sigue siendo cierto para los primeros 90 días y deja de serlo después.

- **Costo: el canal SSE queda atado a que el token siga siendo de alta entropía.** La elección del hash
  rápido es válida **solo** bajo esa premisa. Si alguien alguna vez acorta el token "para que entre en un
  QR" o lo hace legible para poder dictarlo por teléfono, el hash rápido pasa de correcto a peligroso sin
  que nada falle ni avise. Es una dependencia entre dos decisiones que hay que leer juntas — por eso
  viven en el mismo ADR.

- **Costo: la sal por credencial impide buscar por hash.** No se puede responder *"¿qué persona tiene este
  PIN?"* con una consulta; hay que verificar de a una. Es exactamente lo que se busca, y a la vez es lo
  que vuelve más cara la validación de *"dos personas no pueden compartir PIN"* que el `TECH-DESIGN.md`
  exige: pasa de un índice único a una comprobación explícita contra cada PIN activo al darlo de alta.

- **Costo: un estado más en `Dispositivo` que puede quedar mal.** `expira_en` con renovación automática
  significa que un bug en la renovación no se manifiesta hasta 90 días después, en una pantalla que venía
  funcionando. Falla tarde y lejos de su causa.

- **Costo: la rotación del token es una acción más en `/admin`.** Otra pantalla, otro estado, y un
  administrador que puede no entender la diferencia entre rotar y revocar. La interfaz tiene que
  explicarla, porque elegir mal en una pérdida real es lo que decide si el equipo robado sigue leyendo el
  stream.
