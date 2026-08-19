# ADR 0019: Ventana de servicio simétrica y rechazo atómico de la comanda

## Estado

Aceptado — enmienda a ADR-0016 en el punto de la asimetría de apertura. **Precisado por ADR-0026** en el
pedido mixto: un envío aceptado que mezcla ítems con y sin cocina se representa como **dos comandas**. Eso
**no** contradice el *"un envío nunca tiene éxito parcial"* de este ADR, que es una regla sobre el
**rechazo**; si rechazo y división concurren, **manda el rechazo** (ver *Consecuencias* de ADR-0026). **Precisado también
por ADR-0028**: *"un servicio por día"* se lee sobre el **día operativo** (05:00 a 05:00), y describe la
operación normal, no un límite — un servicio que abre el sábado y cierra el domingo a la 01:00 es **uno
solo**, dentro de una sola jornada.

## Contexto

ADR-0016 estableció una **asimetría deliberada**: con la cocina cerrada no se enviaba comida, pero con el
servicio **sin iniciar** sí se enviaba, con un aviso. El argumento era de riesgo: *"un cierre es una
decisión que alguien tomó, y un 'sin iniciar' es casi siempre un olvido. Bloquear el olvido frenaría el
salón entero hasta que alguien camine hasta la cocina."*

El PRD v1.4 anuló esa asimetría: **sin servicio de cocina abierto no se envía comida, da igual el motivo.**
El argumento que la reemplaza es que el motivo por el que nadie está mirando la pantalla no cambia el
resultado para el cliente — el plato no se cocina igual.

El cambio tiene una consecuencia técnica que no es obvia: **el rechazo deja de ser una excepción y pasa a
ser cotidiano.** Antes solo podía ocurrir después del cierre, un momento acotado del día. Ahora también
ocurre antes de la apertura, que es el estado por defecto **cada mañana**, con un mesero parado en el
salón y un pedido ya armado.

Eso obliga a decidir algo que ADR-0016 no necesitaba resolver: **qué pasa con un pedido mixto** —un lomo
saltado y dos gaseosas— cuando la cocina no está abierta. El PRD exige que lo que no requiere cocina se
siga vendiendo siempre, así que rechazar el pedido entero y punto tampoco es aceptable.

`ServicioCocina` **no cambia**: ya era una fila por servicio y ya decía que reabrir no existe. El PRD v1.5
solo ajusta la expectativa —normalmente **un servicio por día**, que abre con el negocio y cierra con él— y
convierte lo que antes era el turno de la cena en una **reapertura excepcional**, que el modelo ya
representaba como un servicio nuevo.

## Decisión

**La ventana de servicio es simétrica, y la comanda se rechaza de forma atómica.**

El backend rechaza toda comanda que contenga algún ítem con `requiere_cocina` **mientras no exista un
`ServicioCocina` abierto**, sin distinguir si el servicio todavía no se inició o si ya se cerró. El
rechazo devuelve **qué ítems la bloquearon**.

```
POST comanda [lomo, gaseosa, gaseosa]   con servicio no abierto
  → 409  servicio_no_abierto
         bloqueada_por: [lomo]

  Nada se persiste. La cuenta queda intacta.
```

La estación ofrece entonces **enviar solo lo que no requiere cocina** como una **acción aparte y
explícita**, que el mesero decide. No hay envío parcial implícito: cada llamada tiene un único resultado,
y el salto de "quería mandar todo" a "mando solo las bebidas" lo da una persona, no el servidor.

Una comanda que **no** contiene ningún ítem con `requiere_cocina` se acepta siempre, con la cocina abierta
o cerrada.

## Alternativas consideradas

- **División automática en el backend** — el servidor acepta los ítems sin `requiere_cocina`, rechaza el
  resto y devuelve las dos listas en una sola llamada. Era viable y le ahorraba un toque al mesero, que en
  un salón con tres estaciones compartidas no es poco. No se eligió porque un envío que funciona a medias
  es el peor resultado posible en este flujo: el mesero lee "enviado", se va a atender otra mesa, y el
  cliente espera un plato que nadie está cocinando. El costo de la ambigüedad lo paga alguien que no está
  mirando la pantalla.
- **Encolar hasta la apertura** — la comanda se acepta y queda retenida hasta que abran, que es lo que
  hacía el criterio de `TECH-DESIGN.md` bajo la asimetría anterior. Era viable y era la opción de menor
  fricción para el salón. No se eligió porque contradice la regla dura del PRD v1.4 y porque reintroduce
  la comanda invisible que el propio ADR-0016 declaraba como riesgo derivado: un plato marcado como
  "enviado" que nadie está mirando es una promesa falsa al cliente, y el mesero no tiene cómo saberlo.

## Consecuencias

- La regla queda **simétrica y explicable en una frase**: si no hay cocina abierta, no sale comida. No hay
  que enseñarle a nadie una excepción según el motivo del estado.
- **Desaparece el riesgo derivado de ADR-0016.** Aquel ADR obligaba a que la pantalla de pared mostrara
  "cocina sin iniciar **con el conteo de comandas en espera**", para que una comanda anterior a la
  apertura no quedara invisible. Con el rechazo, **esa cola no puede existir**: el conteo siempre sería
  cero. El `DESIGN.md` ya se corrigió para mostrar solo el estado, sin contador.
- Cada llamada tiene un resultado inequívoco, y la cuenta nunca queda en un estado intermedio a medio
  enviar.
- **Costo: el mesero paga un toque más** en el caso mixto, y lo paga cada mañana hasta que alguien abra la
  cocina. Es exactamente la fricción que ADR-0016 quería evitar cuando eligió la asimetría; se acepta a
  cambio de que no exista ningún camino en el que un plato quede prometido y sin cocinar.
- **Costo: el olvido de abrir la cocina ahora frena la venta de comida del salón**, que era el argumento
  original de ADR-0016 y sigue siendo cierto. El sistema no lo previene: solo lo hace visible en el
  momento del intento. Si en uso real resultara frecuente, el remedio natural sería un aviso de apertura
  pendiente en la estación de cocina, y hoy **no existe** a propósito, para no agregar un estado que el
  negocio todavía no pidió.
- **Costo: el rechazo tiene que ser reconocible por el cliente, no genérico.** La estación necesita
  distinguir `servicio_no_abierto` de cualquier otro error para poder ofrecer la salida correcta; un 409
  sin código de motivo dejaría al mesero con un mensaje que no le dice qué hacer.
