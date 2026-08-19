# ADR 0001: Un backend y una SPA multi-rol

## Estado

Aceptado

## Contexto

El PRD define tres superficies con usuarios y requisitos distintos: hasta 3 estaciones táctiles
concurrentes, la cocina y el área de administración. Cocina y administración tienen **dos vistas cada
una** —pantalla de pared y estación de marcado (ADR-0016); gestión y dashboard— porque una misma tarea no
se lee y se opera a la misma distancia. El cobro **no** es una superficie propia: desde la v1.2 vive
dentro de la estación del mesero. El `DESIGN.md` las separa
aún más — el KDS va en modo oscuro, con 22px de tipografía mínima y sin fotografía, mientras que la
Estación es clara y con foto protagonista.

Pero todas comparten un único dominio: un local, un inventario, un turno de mesero a la vez por
estación. Y hay exigencias
de tiempo real que cruzan superficies: la comanda llega al KDS en ≤ 3 segundos y el plato agotado
desaparece de las 3 estaciones en ≤ 5 segundos.

La restricción de equipo es un desarrollador y un plazo de trabajo académico.

## Decisión

Un backend y una única SPA con rutas por rol (`/estacion`, `/kds`, `/cocina`, `/admin`). El KDS es una
ruta con su propio tema oscuro, no una aplicación separada. Dos artefactos desplegables en total.

## Alternativas consideradas

- **Frontends separados por superficie** — viable, y permitiría desplegar una corrección del dashboard
  sin tocar la cocina en pleno servicio. No se eligió porque resuelve un problema de independencia de
  despliegue que un local único no tiene, a cambio de tres builds, autenticación compartida entre apps
  y un paquete común que mantener.
- **Monolito renderizado en servidor con actualizaciones en vivo** (LiveView / Hotwire / Livewire) —
  viable, y hacía el tiempo real casi gratuito, que es la parte más difícil de este producto. No se
  eligió porque expone cada interacción táctil a la latencia de red, justo donde el PRD fija un
  criterio de velocidad de registro de pedido.

## Consecuencias

- Un solo cliente de eventos, un solo modelo de sesión y un solo lugar donde se resuelve la
  reconexión — que es la parte más delicada del PRD.
- Costo: el bundle carga código que ninguna superficie usa entera. Obliga a carga diferida por ruta, y
  el KDS —el cliente más crítico— arrastra el peso de la infraestructura común de la SPA.
- Costo: no se puede desplegar una corrección del dashboard sin recargar también las estaciones y el
  KDS. En pleno servicio, eso es una ventana de riesgo operativo.
