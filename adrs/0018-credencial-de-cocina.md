# ADR 0018: La credencial de cocina es una llave del servicio, no una identidad

## Estado

Aceptado — enmienda a ADR-0016 en el punto de la identidad. **Completado por ADR-0031**, que le da al PIN
de cocina el formato que le faltaba (**6 dígitos**), su límite de intentos, su arranque, y resuelve la
autorización del canal SSE que este ADR declaró explícitamente no cerrar.

## Contexto

ADR-0016 decidió que cocina **no tiene identidad de usuario en ninguna de sus dos vistas**: "no hay
login, no hay PIN, no hay sesión y no hay turno". El PRD v1.4 lo contradice en un punto concreto: la
cocina tiene ahora **un PIN único y compartido por todos los cocineros**, que se pide **solo al abrir y
al cerrar el servicio**.

Conviene ser preciso con qué se invierte, porque ADR-0016 argumentó bien y la mayor parte de su
razonamiento **sigue en pie**:

- Sigue siendo cierto que **cocina no ficha**, y que un turno de cocina sería una ceremonia inventada
  para tener a quién atribuirle el marcado. Esto **no** crea un turno de cocina.
- Sigue siendo cierto que **pedir PIN en cada marcado es inviable por la física de la tarea**: el botón
  mide 72px porque se toca con el dorso de la mano. Esto **no** toca el marcado.
- Sigue siendo cierto que **una sesión en cocina se desloguea sola en pleno servicio**, que era el
  problema original del hallazgo #6. Esto **no** introduce una sesión.

Lo que cambió es otra cosa, y el propio ADR-0016 la dejó escrita como consecuencia: *"cocina gana
autoridad sobre el salón… una estación de cocina caída o con un cierre accidental puede frenar la venta
del salón"*. La acción de cerrar cocina **corta la venta de comida de todo el local**, y estaba a un
toque de cualquiera que pasara por la cocina. El PIN que pide el PRD no busca saber quién fue: busca que
esa acción cueste algo.

Además, el PRD v1.5 le dio dueño a esa llave —el administrador la define y la rota—, que era un hueco
abierto: la v1.4 creó el PIN sin decir quién lo gobierna.

## Decisión

**El PIN de cocina es una credencial del servicio, no de una persona.** Vive hasheado en una entidad
propia, la administra el administrador, y se **verifica en el momento** de dos acciones:

```
CredencialCocina
  pin_hash
  actualizada_en
  actualizada_por      → administrador

Abrir servicio    → verifica PIN → crea ServicioCocina
Cerrar servicio   → confirmación explícita + verifica PIN
Marcar unidad     → no pide nada
Terminar orden    → no pide nada
Historial         → no pide nada
KDS de pared      → no pide nada, nunca
```

No emite sesión ni token, no identifica a nadie y no queda asociada a una `Persona`: **`Persona` con rol
`cocina` sigue sin `pin_hash`**, exactamente como decidió ADR-0016. La autorización de la escritura sigue
siendo la de aquel ADR — estación de cocina con servicio abierto—, y la credencial solo gobierna el
**ciclo del servicio**.

Vive en entidad propia y no en `ConfiguracionOperativa` porque no es un parámetro: es un secreto. Tiene
otro ciclo de vida, no se muestra nunca en pantalla y se rota por un motivo distinto —cambió el
personal— que el de ajustar un umbral.

## Alternativas consideradas

- **El PIN abre una sesión de estación de cocina**, de larga duración y sin timeout por inactividad, que
  autoriza el marcado y la suscripción al canal SSE. Era viable y tenía un beneficio real: avanzaba sobre
  el hallazgo #6, que hoy sigue abierto porque ninguna vista de cocina tiene con qué autorizar su
  suscripción al stream. No se eligió porque reintroduce en cocina exactamente lo que ADR-0016 quiso
  eliminar: algo que se puede perder. Una recarga del navegador o un reinicio del dispositivo obligaría a
  retipear el PIN con las manos ocupadas y en medio del servicio, y la pantalla de pared seguiría sin
  sesión de todos modos, así que resolvía medio problema a cambio de un riesgo entero.
- **PIN por persona de cocina**, con `abierto_por` y `cerrado_por` en `ServicioCocina`. Era viable y
  estrictamente superior en trazabilidad: cerraba el riesgo que el propio PRD declara —"el sistema no
  puede decir quién cerró la cocina"— y daría atribución real sobre la acción más consecuente del rol. No
  se eligió porque **contradice el PRD**, que especifica "un solo PIN para todos, no uno por cocinero", y
  porque administrar PINs por cocinero es fichaje con otro nombre, que es justo lo que el PRD descarta
  para ese rol.

## Consecuencias

- La acción que corta la venta de comida de todo el salón deja de estar a un toque de distancia. La
  fricción queda proporcional a la consecuencia, que es el criterio que el `DESIGN.md` llama *"dos pesos
  para dos consecuencias"*.
- Se conserva intacta la propiedad que ADR-0016 buscaba: **no hay ninguna sesión en cocina que se pueda
  perder en pleno servicio.** El PIN se tipea dos veces por día, y en los dos únicos momentos en que el
  cocinero no está cocinando.
- El administrador gana gobierno sobre la llave y puede rotarla cuando rota el personal. Cierra el hueco
  que abrió la v1.4 al crear el PIN sin dueño.
- **Costo: sigue sin haber atribución.** El PIN dice "alguien de la cocina", no quién. El riesgo que el
  PRD declara —"el sistema no puede decir quién lo hizo"— **no queda cerrado por esta decisión**; se
  mitiga apenas con la bitácora de aperturas y cierres con su hora, que dice *cuándo*, no *quién*.
- **Costo: es un secreto compartido.** Se filtra sola en un equipo que rota, no hay forma de detectar su
  uso indebido, y la rotación depende de que el administrador se acuerde. Es el mismo tipo de riesgo por
  disciplina que el PRD ya declara para la carga de datos, y tiene el mismo remedio: ninguno técnico.
- **Costo: no aporta nada al hallazgo #6 por el lado del canal SSE.** La suscripción de las dos vistas de
  cocina al stream sigue sin autorización decidida, y esta decisión **no debe leerse** como que lo
  resuelve. Sigue abierto, junto con la autenticación de `/admin`.
