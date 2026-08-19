# ADR 0024: El turno sin cerrar lo cierra el administrador, con la hora corregible

## Estado

Aceptado. Cierra un caso borde que el PRD tenía abierto.

## Contexto

ADR-0020 dejó declarado un riesgo que no cerraba: el mesero que cobra todas sus cuentas y **se va sin
cerrar turno**. `Turno.cerrado_en` queda nulo, sus horas efectivas quedan corriendo, y el negocio no tiene
la consolidación que le dice cuánto efectivo debería recibir.

El caso arrastra una pregunta que no estaba planteada: **qué pasa cuando ese mesero vuelve al día
siguiente.** Si el turno de ayer sigue abierto, o bien su jornada cruza dos días, o bien el sistema abre
uno nuevo y el viejo queda colgado para siempre.

Y arrastra otra: **con qué hora se cierra.** Cerrarlo cuando alguien lo descubre le regalaría las horas
que pasaron desde que se fue. La hora real la sabe una persona que estaba ahí, no una heurística.

## Decisión

**El turno sin cerrar no bloquea a nadie, y lo cierra el administrador, que puede corregir la hora.**

- **El mesero nunca queda trabado.** Al día siguiente su login abre un turno nuevo con normalidad; el
  anterior queda abierto. Bloquearlo obligaría a que el salón espere una tarea del administrador.
- **Los turnos sin cerrar caen en una bandeja del administrador**, con contador en la navegación como toda
  bandeja de trabajo.
- **Al cerrarlo, el administrador puede corregir `cerrado_en`** a la hora en que el mesero efectivamente se
  fue. El sistema **propone** la hora de su última actividad registrada, que es lo más cercano que puede
  saber por sí solo, y el administrador la acepta o la corrige.
- **Todo cierre tardío deja traza**, porque una hora editable sin traza es un dato que cualquiera puede
  escribir y nadie puede auditar:

```
Turno
  cerrado_en             → el valor final
  cerrado_por            → mesero | administrador
  cerrado_en_propuesto   → la última actividad que el sistema propuso
  motivo_cierre_tardio   → obligatorio cuando cierra el administrador
```

- **`cerrado_en` no puede ser posterior al `abierto_en` del siguiente turno del mismo mesero.** Sin esa
  validación, una corrección descuidada crea dos turnos superpuestos y las horas de ese mesero dejan de
  ser sumables.
- **El `CierreTurno` generado así se marca como no firmado por el mesero**, y se muestra distinto en el
  dashboard. El PRD dice que *a entregar* es "la cifra que el mesero firma"; una cifra que firmó otro no
  puede leerse igual.

## Alternativas consideradas

- **Cierre automático por corte diario** — a una hora fija, todo turno abierto se cierra solo con la hora
  de la última actividad. Era viable y tenía la virtud de que el dato nunca queda colgado sin depender de
  nadie. No se eligió porque genera un `CierreTurno` con su *a entregar* **que nadie firmó**, y eso no
  cierra el caso: lo tapa con un número sin dueño. Además fija la hora con una heurística en el único
  escenario donde hay una persona que sabe la respuesta real.
- **Lo cierra el mesero en su próximo login**, obligado antes de hacer cualquier otra cosa. Era viable y
  ponía la firma en el responsable correcto. No se eligió porque el mesero tampoco puede fijar bien la
  hora —tendría que declararla de memoria, sin contraparte— y porque no cubre al que no vuelve: renuncia,
  vacaciones o franco dejan el turno abierto igual, así que hacía falta el camino del administrador de
  todos modos.

## Consecuencias

- La hora la fija **quien puede saberla**: una persona que estaba en el local, no una regla que infiere.
- El mesero nunca queda bloqueado por una tarea pendiente de otro rol.
- La bandeja hace **visible** el problema en lugar de dejarlo latente, y cae natural junto al *cierre del
  día por mesero* que el dashboard ya muestra.
- **Costo: es un campo de horas que el administrador puede escribir a mano.** La traza registra quién lo
  hizo y contra qué valor propuesto, pero el sistema **no puede validar la realidad**: si el administrador
  pone una hora que no ocurrió, el dato queda mal y parece bien. Es control por auditoría, no por
  imposibilidad.
- **Costo: hasta que el administrador lo cierre, las horas de ese día están incompletas**, y el contraste
  entre horas programadas y efectivas de ese período no cierra. El problema se ve, pero se ve tarde.
- **Costo: hay dos clases de `CierreTurno`** —firmado por el mesero y cerrado por el administrador— y
  cualquier reporte que los sume sin distinguirlos mezcla una entrega de efectivo real con una
  reconstrucción posterior.
