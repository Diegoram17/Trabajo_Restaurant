# ADR 0017: La cuenta es del mesero y el estado de la mesa se deriva

## Estado

Aceptado — reemplaza a ADR-0012. **Corregido por ADR-0027** en su predicado: cuando ADR-0025 agregó el
estado `fusionada`, el `estado <> cerrada` de este ADR dejó la mesa de origen ocupada para siempre. El
predicado vigente es **`estado IN (abierta, en_cobro)`**, en el índice único y en la derivación.

## Contexto

ADR-0012 resolvió el caso borde de "dos meseros abren la misma mesa" asignando la mesa al primero que
la tomaba, con bloqueo suave por `tomada_hasta` y una acción de forzar la toma. Esa decisión partía de
una premisa del PRD que **ya no rige**: que la mesa era la unidad de la cuenta y tenía un solo mesero.

El PRD (v1.4) cambió el modelo de raíz: *"la cuenta es del mesero, no de la mesa"*. Una mesa puede
sostener **varias cuentas abiertas a la vez, una por mesero**, independientes entre sí; cada mesero ve,
edita y cobra únicamente la suya; y el estado *ocupada* **informa pero no bloquea**. No hay transferencia
de mesas ni de cuentas entre meseros.

Eso deja sin sustento a `Mesa.mesero_asignado`, a `Mesa.tomada_hasta` y al parámetro
`ConfiguracionOperativa.bloqueo_mesa_min`, y obliga a decidir dónde vive el estado de la mesa — que es la
lectura más caliente del sistema, con hasta tres estaciones mirándola en vivo.

Conviene registrar que la tensión que originó ADR-0012 **se disuelve**, no se resuelve: aquel ADR tuvo
que separar los caminos de la comisión (que seguía a la comanda) y de la propina (que seguía a la mesa,
"que tiene un solo mesero asignado"). Con la cuenta como unidad de propiedad, los dos siguen al mismo
sujeto, porque una cuenta tiene exactamente un mesero.

## Decisión

**`Mesa` conserva únicamente su número; su estado se deriva contando sus cuentas abiertas.** La
propiedad vive en `Cuenta`, que lleva su mesero dueño, con unicidad de una cuenta abierta por
(mesa, mesero).

```
Mesa            → numero
Cuenta          → mesa, mesero, estado (abierta | en_cobro | cerrada)
                  UNIQUE (mesa, mesero) WHERE estado IN (abierta, en_cobro)   ← corregido por ADR-0027

Mesa.estado (derivado):                     ← corregido por ADR-0027
  0 cuentas en (abierta, en_cobro)  → libre
  ≥ 1                               → ocupada
```

Ninguna consulta de autorización mira la mesa: para abrir, editar o cobrar se mira la **cuenta y su
mesero**. La mesa vuelve a *libre* sola, cuando se cierra la última cuenta que tenía.

## Alternativas consideradas

- **Estado materializado en `Mesa`** — viable y más rápido de leer: la grilla de mesas sería un `SELECT`
  directo sin agregación, sobre la pantalla más consultada del sistema. No se eligió porque obliga a
  sostener a mano un invariante en dos puntos —al abrir y al cerrar cada cuenta— y una transacción que
  falle a medias deja una mesa ocupada sin cuentas, sin nada que lo corrija. Es el mismo patrón que este
  diseño ya rechazó al elegir una fila por unidad en `ItemComanda` en vez de mantener
  `anuladas + listas ≤ cantidad`, y al derivar el estado `demorada` en lugar de persistirlo.
- **Mesero principal informativo en `Mesa`** — viable, conservaba de ADR-0012 el dato de quién atiende
  esa mesa, útil para el salón. No se eligió porque sería estado decorativo: no gobierna ninguna regla,
  el PRD no lo pide, y aun así habría que mantenerlo y decidir qué pasa con él cuando ese mesero cierra
  su cuenta y el otro sigue abierto.

## Consecuencias

- Desaparecen el bloqueo, el vencimiento, la acción de forzar la toma y el parámetro
  `bloqueo_mesa_min`. Con ellos desaparece también la elección imposible que ADR-0012 declaraba como
  costo: un plazo corto permite pisarse y uno largo deja mesas rehenes.
- La atribución queda cerrada por construcción: comisión, propina y efectivo siguen a la cuenta, que
  tiene un solo dueño. Ya no hacen falta dos caminos distintos ni la posibilidad de que uno contamine al
  otro.
- Nadie puede quedar bloqueado por una estación colgada ni por un mesero que se fue: abrir una cuenta
  nueva en una mesa ocupada siempre está disponible.
- Costo: la vista de mesas pasa a ser una **agregación**, no una lectura de campo. Con tres estaciones
  refrescando en vivo hay que resolverla en una sola consulta con índice sobre `(mesa, estado)`, y no con
  un conteo por mesa. Es barato a esta escala, pero deja de ser gratis.
- Costo: "mesa ocupada que no es mía" es un concepto nuevo para el salón, y una mesa física con dos
  cuentas es una situación que la interfaz tiene que explicar sin ambigüedad. El `DESIGN.md` lo resuelve
  mostrando la cuenta ajena atenuada y sin acción, pero es un caso más que el mesero debe entender en
  medio del servicio.
- Costo: se pierde la noción de "quién atiende esta mesa" a nivel de mesa. Si alguna vez se quiere
  reportar por mesa y no por cuenta, hay que agregar sobre las cuentas.
