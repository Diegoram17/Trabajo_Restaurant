# ADR 0014: Sesión corta con cierre automático en la estación

## Estado

Aceptado. **Completado por ADR-0031**, que decide lo que este ADR dejó fuera: la autenticación de
`/admin`, la autorización del canal SSE y el límite de intentos. `/estacion` no cambia: PIN de 4 dígitos y
sesión corta. **Su frontera la precisa ADR-0020**, que separa dos cosas que se nombraban parecido: la
**sesión** de este ADR dura una pasada por la estación y se cierra sola; el **turno** dura la jornada y
es el que mide las horas efectivas del mesero. **Las horas no se miden sobre la sesión**, así que este ADR
puede hacer la sesión tan corta como haga falta sin ninguna consecuencia sobre el fichaje.

## Contexto

El PRD define login por PIN en estación compartida y marca como riesgo explícito que "un mesero deja la
sesión abierta en una estación y otro **toma o cobra** sobre su PIN — la venta, la propina y el efectivo
se atribuyen al mesero equivocado". El `DESIGN.md` exige PIN enmascarado sin opción de revelar, por
tratarse de una pantalla a la vista del salón.

Desde la v1.2 el PIN en sesión es la **única** prueba de atribución: al desaparecer el cajero, el PRD
decide explícitamente no agregar un login extra para cobrar, así que la misma sesión que arma el pedido
registra el pago, la propina y el efectivo recolectado. Eso sube la apuesta — una sesión abandonada ya no
contamina solo comisiones, atribuye dinero físico a la persona equivocada.

La duración de la sesión es la variable que decide si ese riesgo existe o no. Pero no puede resolverse
con un único punto de cierre: el mesero atiende y cobra en momentos distintos, y suele cobrar varias de
sus mesas en una misma pasada por la estación.

## Decisión

La sesión se cierra automáticamente al enviar el pedido a cocina y tras un breve periodo de
inactividad. La estación vuelve siempre a la pantalla de PIN.

Tras **registrar un pago** la sesión **no** se cierra sola: la estación ofrece salir o volver a la vista
de mesas, porque cerrar ahí obligaría a retipear el PIN por cada mesa de una misma pasada de cobro. El
periodo de inactividad sigue corriendo y es lo que acota la ventana. Así lo hace el prototipo validado
de la estación (`prototypes/estacion-mesero.html`).

El **cierre de turno** cierra la sesión de forma definitiva: es el fin del turno del mesero, no una
pausa.

## Alternativas consideradas

- **Sesión persistente con salida manual** — viable y de mínima fricción, con el nombre del mesero
  activo fijo en la barra superior como mitigación visual. No se eligió porque deja intacto el riesgo
  que el PRD nombra, y la mitigación depende de que alguien mire el indicador.
- **Identidad de dispositivo con PIN al confirmar** — viable y probablemente superior: navegar el menú
  sería anónimo y el PIN se pediría en el instante exacto en que la atribución importa, combinando baja
  fricción con buena seguridad. No se eligió por hacer convivir dos conceptos de identidad —dispositivo
  y persona— y ampliar la superficie de error en un proyecto de una sola persona.

## Consecuencias

- El riesgo de atribución errónea de comisiones y propinas desaparece casi por completo en la toma del
  pedido, que es el punto de mayor frecuencia.
- Costo aceptado: la ventana entre cobros de una misma pasada queda abierta hasta el timeout de
  inactividad. Es la concesión deliberada a la velocidad de cobro, y es la ventana por la que puede
  entrar el caso borde del PRD "dos meseros atienden mesas contiguas y uno cobra por error una mesa del
  otro".
- Costo: el mesero tipea cuatro dígitos en cada pedido. Con cola en la estación en hora pico, ese costo
  es real y compite directamente con el criterio de velocidad de registro del PRD.
- Costo: el periodo de inactividad es un parámetro delicado. Muy corto expulsa al mesero mientras arma
  un pedido largo; muy largo devuelve el problema que la decisión venía a resolver.
